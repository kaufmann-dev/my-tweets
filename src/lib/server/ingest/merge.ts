import { minIsoDate } from './dates.ts';
import {
	isPseudoAccountId,
	type NormalizedAccount,
	type NormalizedMedia,
	type NormalizedTweet
} from './types.ts';

function outranks(incoming: NormalizedTweet, existing: NormalizedTweet): boolean {
	if (incoming.sourceRank !== existing.sourceRank) return incoming.sourceRank > existing.sourceRank;
	return incoming.snapshotAt >= existing.snapshotAt;
}

/**
 * Combines the media of two versions of a tweet. The winning version's list is kept; the other
 * version only contributes local files the winner lacks, or its whole list when the winner has
 * no media at all, so the same picture is never listed twice under different keys.
 */
export function mergeMedia(
	primary: NormalizedMedia[],
	secondary: NormalizedMedia[]
): NormalizedMedia[] {
	if (primary.length === 0) return secondary.map((media, position) => ({ ...media, position }));
	const byKey = new Map<string, NormalizedMedia>();
	for (const media of primary) byKey.set(media.mediaKey, { ...media });
	for (const media of secondary) {
		const current = byKey.get(media.mediaKey);
		if (current) {
			if (!current.fileName && media.fileName) {
				current.fileName = media.fileName;
				current.contentType = media.contentType;
				current.bytes = media.bytes;
			}
		} else if (media.fileName) {
			byKey.set(media.mediaKey, { ...media });
		}
	}
	return [...byKey.values()].map((media, position) => ({ ...media, position }));
}

/** Imports only ever add or improve information: tweets are never removed and deletion marks stick. */
export function mergeTweet(
	existing: NormalizedTweet | undefined,
	incoming: NormalizedTweet
): NormalizedTweet {
	if (!existing) return { ...incoming, media: incoming.media.map((media) => ({ ...media })) };
	const [winner, other] = outranks(incoming, existing)
		? [incoming, existing]
		: [existing, incoming];
	const accountId =
		isPseudoAccountId(winner.accountId) && !isPseudoAccountId(other.accountId)
			? other.accountId
			: winner.accountId;
	return {
		...winner,
		accountId,
		inReplyToStatusId: winner.inReplyToStatusId ?? other.inReplyToStatusId,
		inReplyToScreenName: winner.inReplyToScreenName ?? other.inReplyToScreenName,
		deletedAt: minIsoDate(existing.deletedAt, incoming.deletedAt),
		community: existing.community || incoming.community,
		media: mergeMedia(winner.media, other.media)
	};
}

export function mergeAccount(
	existing: NormalizedAccount | undefined,
	incoming: NormalizedAccount
): NormalizedAccount {
	if (!existing) return { ...incoming, usernames: [...new Set(incoming.usernames)] };
	const newer = incoming.snapshotAt >= existing.snapshotAt ? incoming : existing;
	return {
		...newer,
		usernames: [...new Set([...existing.usernames, ...incoming.usernames])]
	};
}
