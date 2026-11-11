import { toIsoDate } from './dates.ts';
import {
	contentTypeForFile,
	mediaKeyFromUrl,
	mediaKindForFile,
	parseMediaFileName
} from './media.ts';
import { mergeTweet } from './merge.ts';
import { normalizeArchiveText, stripHtml } from './text.ts';
import {
	ImportFormatError,
	SOURCE_RANK,
	type MediaFileSource,
	type MediaKind,
	type NormalizedAccount,
	type NormalizedMedia,
	type NormalizedTweet,
	type TweetKind
} from './types.ts';
import { parseYtdArray, parseYtdValue } from './ytd.ts';
import { openZip, type ZipReader } from './zip.ts';

interface ArchiveMediaEntity {
	type?: string;
	url?: string;
	media_url_https?: string;
	media_url?: string;
	video_info?: { variants?: { url?: string; bitrate?: string; content_type?: string }[] };
}

interface ArchiveTweet {
	id_str?: string;
	id?: string;
	full_text?: string;
	text?: string;
	created_at?: string;
	deleted_at?: string;
	user_id?: string;
	share?: unknown;
	in_reply_to_status_id_str?: string;
	in_reply_to_screen_name?: string;
	lang?: string;
	source?: string;
	favorite_count?: string | number;
	retweet_count?: string | number;
	retweeted_status?: unknown;
	entities?: { urls?: { url?: string; expanded_url?: string }[]; media?: ArchiveMediaEntity[] };
	extended_entities?: { media?: ArchiveMediaEntity[] };
}

export interface ParsedTwitterArchive {
	account: NormalizedAccount;
	tweets: NormalizedTweet[];
	/** Media files referenced by `tweets`, keyed by file name. */
	mediaFiles: Map<string, MediaFileSource>;
	snapshotAt: string;
	close(): void;
}

const TWEET_FILE = /^data\/(tweets?|tweets?-part\d+)\.js$/;
const COMMUNITY_FILE = /^data\/community-tweet(-part\d+)?\.js$/;
const DELETED_FILE = /^data\/deleted-tweets?(-part\d+)?\.js$/;
const MEDIA_DIR =
	/^data\/(tweets_media|tweet_media|deleted_tweets_media|community_tweet_media)\/([^/]+)$/;

function toCount(value: unknown): number {
	const count = Number(value);
	return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
}

function classify(text: string, tweet: ArchiveTweet): TweetKind {
	if (text.startsWith('RT @') || tweet.retweeted_status || tweet.share) return 'retweet';
	if (tweet.in_reply_to_status_id_str) return 'reply';
	return 'tweet';
}

function entityMedia(tweet: ArchiveTweet): NormalizedMedia[] {
	const entities = tweet.extended_entities?.media ?? tweet.entities?.media ?? [];
	const result: NormalizedMedia[] = [];
	for (const entity of entities) {
		const kind: MediaKind =
			entity.type === 'video' ? 'video' : entity.type === 'animated_gif' ? 'gif' : 'photo';
		const remoteUrl = entity.media_url_https ?? entity.media_url ?? null;
		let mediaKey = remoteUrl ? mediaKeyFromUrl(remoteUrl) : null;
		if (kind !== 'photo') {
			// Archives name downloaded videos after the best MP4 variant, not after the thumbnail.
			const best = (entity.video_info?.variants ?? [])
				.filter((variant) => variant.url && variant.content_type === 'video/mp4')
				.sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0];
			const variantKey = best?.url ? mediaKeyFromUrl(best.url) : null;
			if (variantKey) mediaKey = variantKey;
		}
		if (!mediaKey || result.some((media) => media.mediaKey === mediaKey)) continue;
		result.push({
			mediaKey,
			kind,
			fileName: null,
			remoteUrl,
			contentType: null,
			bytes: null,
			position: result.length
		});
	}
	return result;
}

/** Normalizes a full tweet object as found in `tweets.js`, `community-tweet.js` and `deleted-tweets.js`. */
export function normalizeArchiveTweet(
	tweet: ArchiveTweet,
	accountId: string,
	snapshotAt: string,
	flags: { community?: boolean; deleted?: boolean } = {}
): NormalizedTweet | null {
	const id = tweet.id_str ?? tweet.id;
	const createdAt = toIsoDate(tweet.created_at);
	if (!id || !/^\d+$/.test(id) || !createdAt) return null;
	const fullText = tweet.full_text ?? tweet.text ?? '';
	const flat = tweet.full_text === undefined;
	const text = flat
		? normalizeArchiveText(fullText, undefined)
		: normalizeArchiveText(fullText, tweet.entities);
	let kind = classify(fullText, tweet);
	// The pre-2023 flat deleted-tweet format has no reply metadata; replies start with a mention.
	if (flat && kind === 'tweet' && fullText.startsWith('@')) kind = 'reply';
	const replyTo = flat ? (/^@(\w{1,15})/.exec(fullText)?.[1] ?? null) : null;
	return {
		id,
		accountId,
		createdAt,
		text,
		kind,
		inReplyToStatusId: tweet.in_reply_to_status_id_str ?? null,
		inReplyToScreenName: tweet.in_reply_to_screen_name ?? (kind === 'reply' ? replyTo : null),
		lang: tweet.lang ?? null,
		source: stripHtml(tweet.source),
		favoriteCount: toCount(tweet.favorite_count),
		retweetCount: toCount(tweet.retweet_count),
		deletedAt: flags.deleted ? (toIsoDate(tweet.deleted_at) ?? snapshotAt) : null,
		community: flags.community ?? false,
		// The flat format carries less information than a spreadsheet row, so it ranks like one.
		sourceRank: flat ? SOURCE_RANK.spreadsheet : SOURCE_RANK.archive,
		snapshotAt,
		raw: tweet,
		media: flat ? [] : entityMedia(tweet)
	};
}

function readAccount(
	zip: ZipReader,
	prefix: string,
	snapshotAt: string
): Promise<NormalizedAccount> {
	const name = `${prefix}data/account.js`;
	return zip.readText(name).then((source) => {
		const [first] = parseYtdArray(source, 'account.js') as {
			account?: { accountId?: string; username?: string; accountDisplayName?: string };
		}[];
		const account = first?.account;
		if (!account?.accountId || !account.username)
			throw new ImportFormatError('account.js does not describe an account.');
		return {
			id: account.accountId,
			username: account.username,
			displayName: account.accountDisplayName ?? account.username,
			usernames: [account.username],
			snapshotAt
		};
	});
}

async function readSnapshotDate(
	zip: ZipReader,
	prefix: string,
	fileNameHint: string | undefined
): Promise<string> {
	const manifestName = `${prefix}data/manifest.js`;
	if (zip.entries.has(manifestName)) {
		const manifest = parseYtdValue(await zip.readText(manifestName), 'manifest.js') as {
			archiveInfo?: { generationDate?: string };
		};
		const date = toIsoDate(manifest?.archiveInfo?.generationDate);
		if (date) return date;
	}
	const hinted = /(\d{4}-\d{2}-\d{2})/.exec(fileNameHint ?? '')?.[1];
	return toIsoDate(hinted) ?? new Date().toISOString();
}

/**
 * Reads an official Twitter/X archive zip. Handles the current layout (`tweets.js`,
 * `tweets_media/`) and the pre-2023 layout (`tweet.js`, `tweet_media/`, flat `deleted-tweet.js`).
 * The zip stays open until `close()` so media files can be streamed later.
 */
export async function readTwitterArchive(
	zipPath: string,
	fileNameHint?: string
): Promise<ParsedTwitterArchive> {
	const zip = await openZip(zipPath);
	try {
		const accountEntry = [...zip.entries.keys()].find((name) =>
			/^([^/]+\/)?data\/account\.js$/.test(name)
		);
		if (!accountEntry) throw new ImportFormatError('This zip is not a Twitter archive.');
		const prefix = accountEntry.slice(0, -'data/account.js'.length);

		const snapshotAt = await readSnapshotDate(zip, prefix, fileNameHint);
		const account = await readAccount(zip, prefix, snapshotAt);

		const tweets = new Map<string, NormalizedTweet>();
		const files: { name: string; flags: { community?: boolean; deleted?: boolean } }[] = [];
		const localMedia = new Map<string, { entryName: string; size: number }[]>();

		for (const [entryName, entry] of zip.entries) {
			if (!entryName.startsWith(prefix)) continue;
			const relative = entryName.slice(prefix.length);
			if (TWEET_FILE.test(relative)) files.push({ name: entryName, flags: {} });
			else if (COMMUNITY_FILE.test(relative))
				files.push({ name: entryName, flags: { community: true } });
			else if (DELETED_FILE.test(relative))
				files.push({ name: entryName, flags: { deleted: true } });
			else {
				const mediaMatch = MEDIA_DIR.exec(relative);
				const parsed = mediaMatch ? parseMediaFileName(mediaMatch[2]) : null;
				if (!parsed) continue;
				const list = localMedia.get(parsed.tweetId) ?? [];
				list.push({ entryName, size: entry.uncompressedSize });
				localMedia.set(parsed.tweetId, list);
			}
		}
		if (!files.some((file) => !file.flags.community && !file.flags.deleted))
			throw new ImportFormatError('This Twitter archive contains no tweets file.');

		for (const file of files) {
			const items = parseYtdArray(await zip.readText(file.name), file.name.split('/').pop()!);
			for (const item of items) {
				const tweet = ((item as { tweet?: ArchiveTweet }).tweet ?? item) as ArchiveTweet;
				const normalized = normalizeArchiveTweet(tweet, account.id, snapshotAt, file.flags);
				if (normalized)
					tweets.set(normalized.id, mergeTweet(tweets.get(normalized.id), normalized));
			}
		}

		const mediaFiles = new Map<string, MediaFileSource>();
		for (const tweet of tweets.values()) {
			for (const { entryName, size } of localMedia.get(tweet.id) ?? []) {
				const fileName = entryName.slice(entryName.lastIndexOf('/') + 1);
				const { mediaKey } = parseMediaFileName(fileName)!;
				const fileFields = {
					fileName,
					contentType: contentTypeForFile(fileName),
					bytes: size
				};
				const existing = tweet.media.find((media) => media.mediaKey === mediaKey);
				if (existing) Object.assign(existing, fileFields);
				else
					tweet.media.push({
						mediaKey,
						kind: mediaKindForFile(fileName),
						remoteUrl: null,
						position: tweet.media.length,
						...fileFields
					});
				mediaFiles.set(fileName, { name: fileName, size, open: () => zip.open(entryName) });
			}
		}

		return {
			account,
			tweets: [...tweets.values()],
			mediaFiles,
			snapshotAt,
			close: () => zip.close()
		};
	} catch (error) {
		zip.close();
		throw error;
	}
}
