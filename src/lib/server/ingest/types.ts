import type { Readable } from 'node:stream';

export type TweetKind = 'tweet' | 'reply' | 'retweet';
export type MediaKind = 'photo' | 'video' | 'gif';

/** Archive data wins over spreadsheet exports when both describe the same tweet. */
export const SOURCE_RANK = { spreadsheet: 1, archive: 2 } as const;

export interface NormalizedMedia {
	mediaKey: string;
	kind: MediaKind;
	/** File name inside the media directory, or null when only a remote URL is known. */
	fileName: string | null;
	remoteUrl: string | null;
	contentType: string | null;
	bytes: number | null;
	position: number;
}

export interface NormalizedTweet {
	id: string;
	accountId: string;
	/** ISO 8601 timestamps throughout, so they compare correctly as strings. */
	createdAt: string;
	text: string;
	kind: TweetKind;
	inReplyToStatusId: string | null;
	inReplyToScreenName: string | null;
	lang: string | null;
	source: string | null;
	favoriteCount: number;
	retweetCount: number;
	deletedAt: string | null;
	community: boolean;
	sourceRank: number;
	snapshotAt: string;
	raw: unknown;
	media: NormalizedMedia[];
}

export interface NormalizedAccount {
	id: string;
	username: string;
	displayName: string;
	usernames: string[];
	snapshotAt: string;
}

/** A media file that can be streamed from its source (a zip entry or a file on disk). */
export interface MediaFileSource {
	name: string;
	size: number;
	open(): Promise<Readable>;
}

/** Files that cannot be imported, reported to the user as-is. */
export class ImportFormatError extends Error {
	override name = 'ImportFormatError';
}

export const PSEUDO_ACCOUNT_PREFIX = 'screen:';

export function pseudoAccountId(screenName: string): string {
	return PSEUDO_ACCOUNT_PREFIX + screenName.toLowerCase();
}

export function isPseudoAccountId(id: string): boolean {
	return id.startsWith(PSEUDO_ACCOUNT_PREFIX);
}
