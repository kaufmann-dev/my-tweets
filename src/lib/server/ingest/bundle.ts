import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import yazl from 'yazl';
import { z } from 'zod';
import { MEDIA_FILE_NAME, parseMediaFileName } from './media.ts';
import {
	ImportFormatError,
	type MediaFileSource,
	type NormalizedAccount,
	type NormalizedTweet
} from './types.ts';
import { openZip } from './zip.ts';

/**
 * Bundle format, version 1 — written by the full export and the legacy CLI, read by the import:
 *
 *   manifest.json  {"format":"my-tweets","version":1,"exportedAt":ISO,"counts":{…}}
 *   accounts.json  JSON array of NormalizedAccount, one item per line
 *   tweets.json    JSON array of NormalizedTweet (with media and raw), one item per line
 *   media/<file>   media files referenced by tweets[].media[].fileName
 */
export const BUNDLE_FORMAT = 'my-tweets';
export const BUNDLE_VERSION = 1;

export interface BundleCounts {
	accounts: number;
	tweets: number;
	media: number;
}

export interface BundleManifest {
	format: typeof BUNDLE_FORMAT;
	version: typeof BUNDLE_VERSION;
	exportedAt: string;
	counts: BundleCounts;
}

type Items<T> = Iterable<T> | AsyncIterable<T>;

export interface BundleContents {
	counts: BundleCounts;
	accounts: Items<NormalizedAccount>;
	tweets: Items<NormalizedTweet>;
	mediaFiles: Items<MediaFileSource>;
}

/** Streams a JSON array with one item per line, so readers can parse it line by line. */
export async function* jsonArrayLines<T>(items: Items<T>): AsyncGenerator<Buffer> {
	yield Buffer.from('[\n');
	let first = true;
	for await (const item of items) {
		yield Buffer.from((first ? '' : ',\n') + JSON.stringify(item));
		first = false;
	}
	yield Buffer.from(first ? ']\n' : '\n]\n');
}

export function createBundleStream(
	contents: BundleContents,
	exportedAt = new Date().toISOString()
): Readable {
	const zip = new yazl.ZipFile();
	const output = zip.outputStream as Readable;
	zip.on('error', (error: Error) => output.destroy(error));

	const manifest: BundleManifest = {
		format: BUNDLE_FORMAT,
		version: BUNDLE_VERSION,
		exportedAt,
		counts: contents.counts
	};
	zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, '\t') + '\n'), 'manifest.json');
	zip.addReadStream(Readable.from(jsonArrayLines(contents.accounts)), 'accounts.json');
	zip.addReadStream(Readable.from(jsonArrayLines(contents.tweets)), 'tweets.json');

	(async () => {
		for await (const file of contents.mediaFiles) {
			if (!MEDIA_FILE_NAME.test(file.name)) continue;
			// Photos and videos are already compressed; storing them keeps exports fast.
			zip.addReadStreamLazy(`media/${file.name}`, { compress: false, size: file.size }, (done) => {
				file.open().then(
					(stream) => done(null, stream),
					(error) => done(error, Readable.from([]))
				);
			});
		}
		zip.end();
	})().catch((error: Error) => output.destroy(error));

	return output;
}

const isoDate = z.iso.datetime({ offset: true });

const accountSchema = z.object({
	id: z.string().min(1).max(100),
	username: z.string().max(100),
	displayName: z.string().max(500),
	usernames: z.array(z.string().max(100)).max(1000),
	snapshotAt: isoDate
});

const mediaSchema = z.object({
	mediaKey: z.string().regex(/^[A-Za-z0-9_-]+$/),
	kind: z.enum(['photo', 'video', 'gif']),
	fileName: z.string().regex(MEDIA_FILE_NAME).nullable(),
	remoteUrl: z.url({ protocol: /^https?$/ }).nullable(),
	contentType: z.string().max(100).nullable(),
	bytes: z.number().int().nonnegative().nullable(),
	position: z.number().int().nonnegative()
});

const tweetSchema = z.object({
	id: z.string().regex(/^\d+$/),
	accountId: z.string().min(1).max(100),
	createdAt: isoDate,
	text: z.string(),
	kind: z.enum(['tweet', 'reply', 'retweet']),
	inReplyToStatusId: z.string().nullable(),
	inReplyToScreenName: z.string().nullable(),
	lang: z.string().nullable(),
	source: z.string().nullable(),
	favoriteCount: z.number().int().nonnegative(),
	retweetCount: z.number().int().nonnegative(),
	deletedAt: isoDate.nullable(),
	community: z.boolean(),
	sourceRank: z.number().int(),
	snapshotAt: isoDate,
	raw: z.unknown(),
	media: z.array(mediaSchema)
});

const manifestSchema = z.object({
	format: z.literal(BUNDLE_FORMAT),
	version: z.literal(BUNDLE_VERSION),
	exportedAt: isoDate,
	counts: z.object({
		accounts: z.number().int().nonnegative(),
		tweets: z.number().int().nonnegative(),
		media: z.number().int().nonnegative()
	})
});

export interface ParsedBundle {
	manifest: BundleManifest;
	accounts(): AsyncGenerator<NormalizedAccount>;
	tweets(): AsyncGenerator<NormalizedTweet>;
	mediaFiles: Map<string, MediaFileSource>;
	close(): void;
}

/** Recognizes a my-tweets bundle by its manifest without reading the rest of the zip. */
export function isBundleManifest(value: unknown): boolean {
	return (value as { format?: unknown } | null)?.format === BUNDLE_FORMAT;
}

export async function readBundle(zipPath: string): Promise<ParsedBundle> {
	const zip = await openZip(zipPath);
	try {
		if (!zip.entries.has('manifest.json'))
			throw new ImportFormatError('This zip is not a my-tweets export.');
		let manifestValue: unknown;
		try {
			manifestValue = JSON.parse(await zip.readText('manifest.json'));
		} catch {
			throw new ImportFormatError('The export manifest is not valid JSON.');
		}
		const manifest = manifestSchema.safeParse(manifestValue);
		if (!manifest.success) {
			const version = (manifestValue as { version?: unknown } | null)?.version;
			throw new ImportFormatError(
				isBundleManifest(manifestValue) && version !== BUNDLE_VERSION
					? `This export uses format version ${String(version)}, but only version ${BUNDLE_VERSION} is supported.`
					: 'This zip is not a my-tweets export.'
			);
		}
		for (const name of ['accounts.json', 'tweets.json']) {
			if (!zip.entries.has(name)) throw new ImportFormatError(`The export is missing ${name}.`);
		}

		const mediaFiles = new Map<string, MediaFileSource>();
		for (const [entryName, entry] of zip.entries) {
			if (!entryName.startsWith('media/')) continue;
			const name = entryName.slice('media/'.length);
			if (!parseMediaFileName(name)) continue;
			mediaFiles.set(name, { name, size: entry.uncompressedSize, open: () => zip.open(entryName) });
		}

		async function* lines<T>(name: string, schema: z.ZodType<T>): AsyncGenerator<T> {
			const reader = createInterface({ input: await zip.open(name), crlfDelay: Infinity });
			let lineNumber = 0;
			for await (const line of reader) {
				lineNumber += 1;
				let text = line.trim();
				if (text === '' || text === '[' || text === ']') continue;
				if (text.endsWith(',')) text = text.slice(0, -1);
				let value: unknown;
				try {
					value = JSON.parse(text);
				} catch {
					throw new ImportFormatError(`${name} line ${lineNumber} is not valid JSON.`);
				}
				const parsed = schema.safeParse(value);
				if (!parsed.success)
					throw new ImportFormatError(`${name} line ${lineNumber} has an unexpected shape.`);
				yield parsed.data;
			}
		}

		return {
			manifest: manifest.data as BundleManifest,
			accounts: () => lines('accounts.json', accountSchema),
			tweets: () => lines('tweets.json', tweetSchema as z.ZodType<NormalizedTweet>),
			mediaFiles,
			close: () => zip.close()
		};
	} catch (error) {
		zip.close();
		throw error;
	}
}
