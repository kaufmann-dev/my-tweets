import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	ilike,
	inArray,
	isNotNull,
	sql,
	sum,
	type SQL
} from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { tweet, tweetMedia, twitterAccount } from '#lib/server/db/schema.ts';
import { searchTerms, type TweetFilters } from '#lib/tweet-filters.ts';
import type { AccountOption, TweetMediaView, TweetPage } from '#lib/tweet-types.ts';

export const PAGE_SIZE = 30;

function escapeLike(term: string): string {
	return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function filterConditions(filters: TweetFilters, timeZone: string): SQL[] {
	const conditions: SQL[] = searchTerms(filters.q).map((term) =>
		ilike(tweet.text, `%${escapeLike(term)}%`)
	);
	if (filters.account) conditions.push(eq(tweet.accountId, filters.account));
	if (filters.kind !== 'all') conditions.push(eq(tweet.kind, filters.kind));
	if (filters.media)
		conditions.push(
			exists(
				db
					.select({ one: sql`1` })
					.from(tweetMedia)
					.where(eq(tweetMedia.tweetId, tweet.id))
			)
		);
	// Whole days in the viewer's time zone: from the start of `from` to the end of `to`.
	if (filters.from)
		conditions.push(
			sql`${tweet.createdAt} >= (${filters.from}::date::timestamp at time zone ${timeZone})`
		);
	if (filters.to)
		conditions.push(
			sql`${tweet.createdAt} < ((${filters.to}::date + 1)::timestamp at time zone ${timeZone})`
		);
	return conditions;
}

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d+)$/;

function toMediaView(media: typeof tweetMedia.$inferSelect): TweetMediaView | null {
	if (media.fileName) {
		return {
			key: media.mediaKey,
			src: `/media/${media.fileName}`,
			isVideo: media.contentType?.startsWith('video/') ?? false,
			local: true
		};
	}
	if (!media.remoteUrl) return null;
	return {
		key: media.mediaKey,
		src: media.remoteUrl,
		isVideo: /\.mp4(\?|$)/.test(media.remoteUrl),
		local: false
	};
}

export async function listTweets(
	filters: TweetFilters,
	timeZone: string,
	cursor: string | null,
	limit = PAGE_SIZE
): Promise<TweetPage> {
	const newestFirst = filters.sort === 'newest';
	const conditions = filterConditions(filters, timeZone);
	const position = cursor ? CURSOR.exec(cursor) : null;
	if (position) {
		const [, createdAt, id] = position;
		conditions.push(
			newestFirst
				? sql`(${tweet.createdAt}, ${tweet.id}) < (${createdAt}::timestamptz, ${id})`
				: sql`(${tweet.createdAt}, ${tweet.id}) > (${createdAt}::timestamptz, ${id})`
		);
	}

	const order = newestFirst ? desc : asc;
	const rows = await db
		.select({
			id: tweet.id,
			username: twitterAccount.username,
			displayName: twitterAccount.displayName,
			createdAt: tweet.createdAt,
			text: tweet.text,
			kind: tweet.kind,
			inReplyToScreenName: tweet.inReplyToScreenName,
			inReplyToStatusId: tweet.inReplyToStatusId,
			favoriteCount: tweet.favoriteCount,
			retweetCount: tweet.retweetCount,
			community: tweet.community,
			source: tweet.source
		})
		.from(tweet)
		.innerJoin(twitterAccount, eq(twitterAccount.id, tweet.accountId))
		.where(and(...conditions))
		.orderBy(order(tweet.createdAt), order(tweet.id))
		.limit(limit + 1);

	const pageRows = rows.slice(0, limit);
	const mediaRows =
		pageRows.length > 0
			? await db
					.select()
					.from(tweetMedia)
					.where(
						inArray(
							tweetMedia.tweetId,
							pageRows.map((row) => row.id)
						)
					)
					.orderBy(asc(tweetMedia.position))
			: [];

	const items = pageRows.map((row) => ({
		...row,
		createdAt: row.createdAt.toISOString(),
		media: mediaRows
			.filter((media) => media.tweetId === row.id)
			.map(toMediaView)
			.filter((media) => media !== null)
	}));
	const last = items.at(-1);
	return {
		items,
		nextCursor: rows.length > limit && last ? `${last.createdAt}_${last.id}` : null
	};
}

export async function countTweets(filters: TweetFilters, timeZone: string): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(tweet)
		.where(and(...filterConditions(filters, timeZone)));
	return row?.total ?? 0;
}

export async function listAccounts(): Promise<AccountOption[]> {
	const rows = await db
		.select({
			id: twitterAccount.id,
			username: twitterAccount.username,
			displayName: twitterAccount.displayName,
			usernames: twitterAccount.usernames,
			tweets: count(tweet.id)
		})
		.from(twitterAccount)
		.leftJoin(tweet, eq(tweet.accountId, twitterAccount.id))
		.groupBy(twitterAccount.id)
		.orderBy(desc(count(tweet.id)));
	return rows;
}

export async function archiveStats() {
	const [tweets] = await db
		.select({
			total: count(),
			first: sql<Date | null>`min(${tweet.createdAt})`.mapWith(tweet.createdAt),
			last: sql<Date | null>`max(${tweet.createdAt})`.mapWith(tweet.createdAt)
		})
		.from(tweet);
	const [media] = await db
		.select({
			files: count(sql`distinct ${tweetMedia.fileName}`),
			bytes: sum(tweetMedia.bytes).mapWith(Number)
		})
		.from(tweetMedia)
		.where(isNotNull(tweetMedia.fileName));
	const [accounts] = await db.select({ total: count() }).from(twitterAccount);
	return {
		tweets: tweets?.total ?? 0,
		first: tweets?.first ? new Date(tweets.first).toISOString() : null,
		last: tweets?.last ? new Date(tweets.last).toISOString() : null,
		mediaFiles: media?.files ?? 0,
		mediaBytes: media?.bytes ?? 0,
		accounts: accounts?.total ?? 0
	};
}
