import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { and, asc, count, countDistinct, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { tweet, tweetMedia, twitterAccount } from '#lib/server/db/schema.ts';
import { rowToTweet } from '#lib/server/ingest/apply.ts';
import {
	BUNDLE_FORMAT,
	BUNDLE_VERSION,
	createBundleStream,
	jsonArrayLines,
	type BundleCounts
} from '#lib/server/ingest/bundle.ts';
import type {
	MediaFileSource,
	NormalizedAccount,
	NormalizedTweet
} from '#lib/server/ingest/types.ts';
import { mediaDir } from '#lib/server/storage.ts';

const BATCH_SIZE = 1000;

async function exportCounts(): Promise<BundleCounts> {
	const [[accounts], [tweets], [media]] = await Promise.all([
		db.select({ total: count() }).from(twitterAccount),
		db.select({ total: count() }).from(tweet),
		db
			.select({ total: countDistinct(tweetMedia.fileName) })
			.from(tweetMedia)
			.where(isNotNull(tweetMedia.fileName))
	]);
	return { accounts: accounts.total, tweets: tweets.total, media: media.total };
}

async function* allAccounts(): AsyncGenerator<NormalizedAccount> {
	const rows = await db.select().from(twitterAccount).orderBy(asc(twitterAccount.id));
	for (const row of rows) yield { ...row, snapshotAt: row.snapshotAt.toISOString() };
}

/** Streams every tweet in chronological order, in batches, without holding the archive in memory. */
async function* allTweets(): AsyncGenerator<NormalizedTweet> {
	let after: { createdAt: Date; id: string } | null = null;
	for (;;) {
		const rows: (typeof tweet.$inferSelect)[] = await db
			.select()
			.from(tweet)
			.where(
				after
					? sql`(${tweet.createdAt}, ${tweet.id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id})`
					: undefined
			)
			.orderBy(asc(tweet.createdAt), asc(tweet.id))
			.limit(BATCH_SIZE);
		if (rows.length === 0) return;
		const media = await db
			.select()
			.from(tweetMedia)
			.where(
				inArray(
					tweetMedia.tweetId,
					rows.map((row) => row.id)
				)
			);
		const mediaByTweet = Map.groupBy(media, (item) => item.tweetId);
		for (const row of rows) yield rowToTweet(row, mediaByTweet.get(row.id) ?? []);
		const last = rows[rows.length - 1];
		after = { createdAt: last.createdAt, id: last.id };
	}
}

async function* allMediaFiles(): AsyncGenerator<MediaFileSource> {
	let after = '';
	for (;;) {
		const rows = await db
			.selectDistinct({ fileName: tweetMedia.fileName })
			.from(tweetMedia)
			.where(and(isNotNull(tweetMedia.fileName), gt(tweetMedia.fileName, after)))
			.orderBy(asc(tweetMedia.fileName))
			.limit(BATCH_SIZE);
		if (rows.length === 0) return;
		for (const { fileName } of rows) {
			const path = join(mediaDir, fileName!);
			const info = await stat(path).catch(() => null);
			if (!info) {
				console.warn(`Export: media file ${fileName} is missing and was skipped.`);
				continue;
			}
			yield {
				name: fileName!,
				size: info.size,
				open: async () => createReadStream(path)
			};
		}
		after = rows[rows.length - 1].fileName!;
	}
}

export function exportFileName(extension: 'zip' | 'json'): string {
	return `my-tweets-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

/** The full export: a bundle zip with all tweets and media, importable on /import. */
export async function createArchiveExport(): Promise<Readable> {
	const counts = await exportCounts();
	return createBundleStream({
		counts,
		accounts: allAccounts(),
		tweets: allTweets(),
		mediaFiles: allMediaFiles()
	});
}

/** A single JSON file with every account and tweet but no media files. */
export async function createJsonExport(): Promise<Readable> {
	const counts = await exportCounts();
	async function* document(): AsyncGenerator<Buffer> {
		const header = {
			format: BUNDLE_FORMAT,
			version: BUNDLE_VERSION,
			exportedAt: new Date().toISOString(),
			counts
		};
		yield Buffer.from(`${JSON.stringify(header).slice(0, -1)},\n"accounts":`);
		yield* jsonArrayLines(allAccounts());
		yield Buffer.from(',\n"tweets":');
		yield* jsonArrayLines(allTweets());
		yield Buffer.from('}\n');
	}
	return Readable.from(document());
}
