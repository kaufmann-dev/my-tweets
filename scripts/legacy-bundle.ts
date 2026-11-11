/**
 * Converts a folder of old Twitter backups into one my-tweets bundle that can be uploaded on /import.
 *
 *   pnpm legacy:bundle <backup-dir> <out.bundle.zip>
 *
 * Reads every official Twitter archive (`twitter-*.zip`, any layout since 2019) and every
 * spreadsheet export (`*.xlsx`) below <backup-dir>, merges all tweets by id, and writes the bundle.
 */
import { createWriteStream } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createBundleStream } from '../src/lib/server/ingest/bundle.ts';
import { mergeAccount, mergeTweet } from '../src/lib/server/ingest/merge.ts';
import {
	readTwitterArchive,
	type ParsedTwitterArchive
} from '../src/lib/server/ingest/twitter-archive.ts';
import {
	isPseudoAccountId,
	pseudoAccountId,
	type MediaFileSource,
	type NormalizedAccount,
	type NormalizedTweet
} from '../src/lib/server/ingest/types.ts';
import { readXlsxTweets, xlsxRowToTweet } from '../src/lib/server/ingest/xlsx.ts';

async function findFiles(directory: string): Promise<string[]> {
	const found: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) found.push(...(await findFiles(path)));
		else if (entry.isFile()) found.push(path);
	}
	return found;
}

function formatBytes(bytes: number): string {
	return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function main(): Promise<void> {
	const [backupDir, outPath] = process.argv.slice(2);
	if (!backupDir || !outPath) {
		console.error('Usage: pnpm legacy:bundle <backup-dir> <out.bundle.zip>');
		process.exit(1);
	}

	const files = await findFiles(backupDir);
	const archivePaths = files.filter((path) => /^twitter-.*\.zip$/i.test(basename(path)));
	const xlsxPaths = files.filter((path) => /\.xlsx$/i.test(path));
	const skipped: { path: string; reason: string }[] = [];

	const accounts = new Map<string, NormalizedAccount>();
	const tweets = new Map<string, NormalizedTweet>();
	const mediaFiles = new Map<string, MediaFileSource>();
	const archives: ParsedTwitterArchive[] = [];

	for (const path of archivePaths.sort()) {
		try {
			const archive = await readTwitterArchive(path, basename(path));
			archives.push(archive);
			accounts.set(
				archive.account.id,
				mergeAccount(accounts.get(archive.account.id), archive.account)
			);
			for (const tweet of archive.tweets)
				tweets.set(tweet.id, mergeTweet(tweets.get(tweet.id), tweet));
			for (const [name, file] of archive.mediaFiles) mediaFiles.set(name, file);
			console.log(
				`archive  ${basename(path)}: ${archive.tweets.length} tweets (@${archive.account.username})`
			);
		} catch (error) {
			skipped.push({ path, reason: error instanceof Error ? error.message : String(error) });
		}
	}

	// Spreadsheets only know screen names; map them to account ids seen in the archives.
	const accountIdByUsername = new Map<string, string>();
	for (const account of accounts.values()) {
		for (const username of account.usernames)
			accountIdByUsername.set(username.toLowerCase(), account.id);
	}

	const xlsxByAge = await Promise.all(
		xlsxPaths.map(async (path) => ({ path, mtime: (await stat(path)).mtime }))
	);
	xlsxByAge.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
	let xlsxRows = 0;
	let xlsxFiles = 0;
	for (const { path, mtime } of xlsxByAge) {
		const result = await readXlsxTweets(path);
		if (result.status === 'skipped') {
			skipped.push({ path, reason: result.reason });
			continue;
		}
		xlsxFiles += 1;
		const snapshotAt = mtime.toISOString();
		for (const row of result.rows) {
			const screenName = (row['Screen Name'] ?? '').trim();
			if (!screenName) continue;
			const accountId =
				accountIdByUsername.get(screenName.toLowerCase()) ?? pseudoAccountId(screenName);
			const tweet = xlsxRowToTweet(row, accountId, snapshotAt);
			if (!tweet) continue;
			xlsxRows += 1;
			if (isPseudoAccountId(accountId)) {
				accounts.set(
					accountId,
					mergeAccount(accounts.get(accountId), {
						id: accountId,
						username: screenName,
						displayName: (row['Name'] ?? '').trim() || screenName,
						usernames: [screenName],
						snapshotAt
					})
				);
			}
			tweets.set(tweet.id, mergeTweet(tweets.get(tweet.id), tweet));
		}
	}
	console.log(`xlsx     ${xlsxFiles} tweet exports, ${xlsxRows} rows`);

	const ordered = [...tweets.values()].sort(
		(a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
	);
	const referenced = new Set(
		ordered.flatMap((tweet) => tweet.media.map((media) => media.fileName).filter(Boolean))
	);
	const media = [...mediaFiles.values()]
		.filter((file) => referenced.has(file.name))
		.sort((a, b) => a.name.localeCompare(b.name));
	for (const tweet of ordered) {
		// Media files missing from every archive fall back to their remote URL.
		tweet.media = tweet.media
			.map((item) =>
				item.fileName && !mediaFiles.has(item.fileName)
					? { ...item, fileName: null, contentType: null, bytes: null }
					: item
			)
			.filter((item) => item.fileName || item.remoteUrl)
			.map((item, position) => ({ ...item, position }));
	}

	const temporary = `${outPath}.part`;
	try {
		await pipeline(
			createBundleStream({
				counts: { accounts: accounts.size, tweets: ordered.length, media: media.length },
				accounts: [...accounts.values()],
				tweets: ordered,
				mediaFiles: media
			}),
			createWriteStream(temporary)
		);
		await rename(temporary, outPath);
	} finally {
		await rm(temporary, { force: true });
		for (const archive of archives) archive.close();
	}

	const byKind = Map.groupBy(ordered, (tweet) => tweet.kind);
	const byAccount = Map.groupBy(ordered, (tweet) => tweet.accountId);
	console.log('');
	console.log(`Bundle written to ${outPath} (${formatBytes((await stat(outPath)).size)})`);
	console.log(`Tweets   ${ordered.length} unique`);
	for (const [kind, list] of byKind) console.log(`  ${kind.padEnd(8)} ${list.length}`);
	console.log(`  deleted  ${ordered.filter((tweet) => tweet.deletedAt).length}`);
	console.log(`Accounts ${accounts.size}`);
	for (const [accountId, list] of [...byAccount].sort((a, b) => b[1].length - a[1].length)) {
		const account = accounts.get(accountId);
		console.log(`  ${accountId.padEnd(28)} @${account?.username ?? '?'}: ${list.length}`);
	}
	console.log(
		`Media    ${media.length} files, ${formatBytes(media.reduce((total, file) => total + file.size, 0))}`
	);
	console.log(`Skipped  ${skipped.length} files`);
	for (const { path, reason } of skipped) console.log(`  ${basename(path)}: ${reason}`);
}

await main();
