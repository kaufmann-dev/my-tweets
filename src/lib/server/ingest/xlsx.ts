import { readSheet, type SheetData } from 'read-excel-file/node';
import { toIsoDate } from './dates.ts';
import { mediaKeyFromUrl } from './media.ts';
import { decodeTwitterEntities, stripHtml } from './text.ts';
import {
	SOURCE_RANK,
	type MediaKind,
	type NormalizedMedia,
	type NormalizedTweet,
	type TweetKind
} from './types.ts';

/** Header row of the third-party "user tweets" spreadsheet exports. */
export const XLSX_TWEET_HEADER = [
	'Tweet Id',
	'Text',
	'Name',
	'Screen Name',
	'UTC',
	'Created At',
	'Favorites',
	'Retweets',
	'Language',
	'Client',
	'Tweet Type',
	'URLs',
	'Hashtags',
	'Mentions',
	'Media Type',
	'Media URLs'
] as const;

export type XlsxRow = Record<string, string>;

export type XlsxReadResult =
	{ status: 'tweets'; rows: XlsxRow[] } | { status: 'skipped'; reason: string };

const T_CO = /https?:\/\/t\.co\/\w+/g;

function splitList(value: string | undefined): string[] {
	return (value ?? '')
		.split(/[\s,]+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function toCount(value: string | undefined): number {
	const count = Number(value);
	return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
}

/** Maps one spreadsheet row to a tweet. The caller resolves the account from `Screen Name`. */
export function xlsxRowToTweet(
	row: XlsxRow,
	accountId: string,
	snapshotAt: string
): NormalizedTweet | null {
	const id = row['Tweet Id']?.trim();
	const createdAt = toIsoDate(row['UTC']) ?? toIsoDate(row['Created At']);
	if (!id || !/^\d+$/.test(id) || !createdAt) return null;

	const mediaUrls = splitList(row['Media URLs']).filter((url) => /^https?:\/\//.test(url));
	const mediaTypes = splitList(row['Media Type']);
	const media: NormalizedMedia[] = [];
	for (const [index, url] of mediaUrls.entries()) {
		const mediaKey = mediaKeyFromUrl(url);
		if (!mediaKey || media.some((item) => item.mediaKey === mediaKey)) continue;
		const type = mediaTypes[index] ?? mediaTypes[0];
		const kind: MediaKind = type === 'video' ? 'video' : type === 'animated_gif' ? 'gif' : 'photo';
		media.push({
			mediaKey,
			kind,
			fileName: null,
			remoteUrl: url,
			contentType: null,
			bytes: null,
			position: media.length
		});
	}

	// Expand t.co links in order using the URLs column; the last link points at the media.
	let links: string[] = (row['Text'] ?? '').match(T_CO) ?? [];
	let text = row['Text'] ?? '';
	if (media.length > 0 && links.length > 0) {
		text = text.replace(links[links.length - 1], '');
		links = links.slice(0, -1);
	}
	const expanded = splitList(row['URLs']);
	if (expanded.length === links.length) {
		for (const [index, link] of links.entries()) text = text.replace(link, expanded[index]);
	}
	text = decodeTwitterEntities(text).trim();

	const type = (row['Tweet Type'] ?? '').toLowerCase();
	const kind: TweetKind = type === 'reply' ? 'reply' : type === 'retweet' ? 'retweet' : 'tweet';
	return {
		id,
		accountId,
		createdAt,
		text,
		kind,
		inReplyToStatusId: null,
		inReplyToScreenName: kind === 'reply' ? (/^@(\w{1,15})/.exec(text)?.[1] ?? null) : null,
		lang: row['Language'] || null,
		source: stripHtml(row['Client']),
		favoriteCount: toCount(row['Favorites']),
		retweetCount: toCount(row['Retweets']),
		deletedAt: null,
		community: false,
		sourceRank: SOURCE_RANK.spreadsheet,
		snapshotAt,
		raw: row,
		media
	};
}

/** Reads the first sheet of a spreadsheet export; anything other than a tweet export is skipped. */
export async function readXlsxTweets(path: string): Promise<XlsxReadResult> {
	let data: SheetData;
	try {
		data = await readSheet(path, 1);
	} catch {
		return { status: 'skipped', reason: 'unreadable spreadsheet' };
	}
	const [header, ...body] = data;
	const columns = (header ?? []).map((cell) => String(cell ?? '').trim());
	if (columns[0] !== XLSX_TWEET_HEADER[0])
		return { status: 'skipped', reason: `not a tweet export (first column "${columns[0] ?? ''}")` };
	const rows = body.map((cells) => {
		const row: XlsxRow = {};
		for (const [index, column] of columns.entries()) {
			const cell: unknown = cells[index];
			if (!column) continue;
			row[column] =
				cell === null || cell === undefined
					? ''
					: cell instanceof Date
						? cell.toISOString()
						: String(cell);
		}
		return row;
	});
	return { status: 'tweets', rows };
}
