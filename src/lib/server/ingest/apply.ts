import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { tweet, tweetMedia, twitterAccount } from '#lib/server/db/schema.ts';
import { mediaDir } from '#lib/server/storage.ts';
import { mergeAccount, mergeTweet } from './merge.ts';
import {
	ImportFormatError,
	isPseudoAccountId,
	PSEUDO_ACCOUNT_PREFIX,
	type MediaFileSource,
	type NormalizedAccount,
	type NormalizedMedia,
	type NormalizedTweet
} from './types.ts';

type Items<T> = Iterable<T> | AsyncIterable<T>;

export interface ImportSource {
	accounts: Items<NormalizedAccount>;
	tweets: Items<NormalizedTweet>;
	mediaFiles: Map<string, MediaFileSource>;
}

export interface ImportCounts {
	tweetsAdded: number;
	tweetsUpdated: number;
	mediaAdded: number;
}

const BATCH_SIZE = 500;

type TweetRow = typeof tweet.$inferSelect;
type MediaRow = typeof tweetMedia.$inferSelect;

export function rowToTweet(row: TweetRow, media: MediaRow[]): NormalizedTweet {
	return {
		id: row.id,
		accountId: row.accountId,
		createdAt: row.createdAt.toISOString(),
		text: row.text,
		kind: row.kind,
		inReplyToStatusId: row.inReplyToStatusId,
		inReplyToScreenName: row.inReplyToScreenName,
		lang: row.lang,
		source: row.source,
		favoriteCount: row.favoriteCount,
		retweetCount: row.retweetCount,
		deletedAt: row.deletedAt?.toISOString() ?? null,
		community: row.community,
		sourceRank: row.sourceRank,
		snapshotAt: row.snapshotAt.toISOString(),
		raw: row.raw,
		media: media
			.sort((a, b) => a.position - b.position)
			.map((item) => ({
				mediaKey: item.mediaKey,
				kind: item.kind,
				fileName: item.fileName,
				remoteUrl: item.remoteUrl,
				contentType: item.contentType,
				bytes: item.bytes,
				position: item.position
			}))
	};
}

function tweetToRow(value: NormalizedTweet): typeof tweet.$inferInsert {
	return {
		id: value.id,
		accountId: value.accountId,
		createdAt: new Date(value.createdAt),
		text: value.text,
		kind: value.kind,
		inReplyToStatusId: value.inReplyToStatusId,
		inReplyToScreenName: value.inReplyToScreenName,
		lang: value.lang,
		source: value.source,
		favoriteCount: value.favoriteCount,
		retweetCount: value.retweetCount,
		deletedAt: value.deletedAt ? new Date(value.deletedAt) : null,
		community: value.community,
		sourceRank: value.sourceRank,
		snapshotAt: new Date(value.snapshotAt),
		raw: value.raw ?? {}
	};
}

/** Everything that matters for change detection; `raw` is covered by rank and snapshot. */
function fingerprint(value: NormalizedTweet): string {
	return JSON.stringify([
		value.accountId,
		value.createdAt,
		value.text,
		value.kind,
		value.inReplyToStatusId,
		value.inReplyToScreenName,
		value.lang,
		value.source,
		value.favoriteCount,
		value.retweetCount,
		value.deletedAt,
		value.community,
		value.sourceRank,
		value.snapshotAt,
		value.media.map((media) => [
			media.mediaKey,
			media.kind,
			media.fileName,
			media.remoteUrl,
			media.contentType,
			media.bytes,
			media.position
		])
	]);
}

const excluded = (name: string) => sql.raw(`excluded."${name}"`);

const tweetUpdateSet = Object.fromEntries(
	Object.entries(getTableColumns(tweet))
		.filter(([key]) => key !== 'id')
		.map(([key, column]) => [key, excluded(column.name)])
);

async function copyMediaFile(source: MediaFileSource, destination: string): Promise<void> {
	const temporary = `${destination}.${randomUUID()}.part`;
	try {
		await pipeline(await source.open(), createWriteStream(temporary));
		await rename(temporary, destination);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
}

/**
 * Makes sure every local media file of a tweet exists in the media directory, copying it from the
 * import source when needed. Entries whose file is neither on disk nor in the source fall back to
 * their remote URL, or are dropped when they have none.
 */
async function storeMedia(
	media: NormalizedMedia[],
	sources: Map<string, MediaFileSource>
): Promise<{ media: NormalizedMedia[]; added: number }> {
	let added = 0;
	const kept: NormalizedMedia[] = [];
	for (const item of media) {
		if (item.fileName) {
			const destination = join(mediaDir, item.fileName);
			const onDisk = await stat(destination).catch(() => null);
			const source = sources.get(item.fileName);
			if (source && (!onDisk || onDisk.size !== source.size)) {
				await copyMediaFile(source, destination);
				item.bytes = source.size;
				added += 1;
			} else if (onDisk) {
				item.bytes = onDisk.size;
			} else {
				item.fileName = null;
				item.contentType = null;
				item.bytes = null;
			}
		}
		if (item.fileName || item.remoteUrl) kept.push({ ...item, position: kept.length });
	}
	return { media: kept, added };
}

async function importAccounts(accounts: Items<NormalizedAccount>) {
	const rows = await db.select().from(twitterAccount);
	const byId = new Map<string, NormalizedAccount>(
		rows.map((row) => [row.id, { ...row, snapshotAt: row.snapshotAt.toISOString() }])
	);
	for await (const incoming of accounts) {
		const merged = mergeAccount(byId.get(incoming.id), incoming);
		byId.set(merged.id, merged);
		const values = { ...merged, snapshotAt: new Date(merged.snapshotAt) };
		await db
			.insert(twitterAccount)
			.values(values)
			.onConflictDoUpdate({
				target: twitterAccount.id,
				set: {
					username: values.username,
					displayName: values.displayName,
					usernames: values.usernames,
					snapshotAt: values.snapshotAt
				}
			});
	}

	// Screen names known only from spreadsheets move to the real account once an archive names it.
	const realIdByUsername = new Map<string, string>();
	for (const account of byId.values()) {
		if (isPseudoAccountId(account.id)) continue;
		for (const username of account.usernames)
			realIdByUsername.set(username.toLowerCase(), account.id);
	}
	for (const account of [...byId.values()]) {
		if (!isPseudoAccountId(account.id)) continue;
		const realId = realIdByUsername.get(account.id.slice(PSEUDO_ACCOUNT_PREFIX.length));
		if (!realId) continue;
		await db.transaction(async (tx) => {
			await tx.update(tweet).set({ accountId: realId }).where(eq(tweet.accountId, account.id));
			await tx.delete(twitterAccount).where(eq(twitterAccount.id, account.id));
		});
		byId.delete(account.id);
	}

	return (accountId: string): string => {
		const resolved = isPseudoAccountId(accountId)
			? (realIdByUsername.get(accountId.slice(PSEUDO_ACCOUNT_PREFIX.length)) ?? accountId)
			: accountId;
		if (!byId.has(resolved))
			throw new ImportFormatError(`A tweet refers to the unknown account ${accountId}.`);
		return resolved;
	};
}

/** Merges an import into the database. Tweets are never deleted; see `mergeTweet`. */
export async function applyImport(
	source: ImportSource,
	onProgress: (counts: ImportCounts) => Promise<void>
): Promise<ImportCounts> {
	const counts: ImportCounts = { tweetsAdded: 0, tweetsUpdated: 0, mediaAdded: 0 };
	const resolveAccount = await importAccounts(source.accounts);

	async function flush(batch: Map<string, NormalizedTweet>) {
		const ids = [...batch.keys()];
		const [rows, mediaRows] = await Promise.all([
			db.select().from(tweet).where(inArray(tweet.id, ids)),
			db.select().from(tweetMedia).where(inArray(tweetMedia.tweetId, ids))
		]);
		const existing = new Map(
			rows.map((row) => [
				row.id,
				rowToTweet(
					row,
					mediaRows.filter((media) => media.tweetId === row.id)
				)
			])
		);

		const changed: NormalizedTweet[] = [];
		for (const incoming of batch.values()) {
			const before = existing.get(incoming.id);
			const merged = mergeTweet(before, incoming);
			const stored = await storeMedia(merged.media, source.mediaFiles);
			merged.media = stored.media;
			counts.mediaAdded += stored.added;
			if (!before) counts.tweetsAdded += 1;
			else if (fingerprint(before) !== fingerprint(merged)) counts.tweetsUpdated += 1;
			else continue;
			changed.push(merged);
		}
		if (changed.length > 0) {
			await db.transaction(async (tx) => {
				await tx
					.insert(tweet)
					.values(changed.map(tweetToRow))
					.onConflictDoUpdate({ target: tweet.id, set: tweetUpdateSet });
				await tx.delete(tweetMedia).where(
					inArray(
						tweetMedia.tweetId,
						changed.map((item) => item.id)
					)
				);
				const media = changed.flatMap((item) =>
					item.media.map((entry) => ({ tweetId: item.id, ...entry }))
				);
				if (media.length > 0) await tx.insert(tweetMedia).values(media);
			});
		}
		await onProgress(counts);
	}

	let batch = new Map<string, NormalizedTweet>();
	for await (const incoming of source.tweets) {
		const value = { ...incoming, accountId: resolveAccount(incoming.accountId) };
		batch.set(value.id, mergeTweet(batch.get(value.id), value));
		if (batch.size >= BATCH_SIZE) {
			await flush(batch);
			batch = new Map();
		}
	}
	if (batch.size > 0) await flush(batch);
	return counts;
}
