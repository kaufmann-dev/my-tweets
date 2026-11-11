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
import type {
	AccountOption,
	TweetMediaView,
	TweetMonth,
	TweetPage,
	TweetView
} from '#lib/tweet-types.ts';

export const PAGE_SIZE = 30;

function escapeLike(term: string): string {
	return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function filterConditions(filters: TweetFilters, timeZone: string): SQL[] {
	const conditions: SQL[] = searchTerms(filters.q).map((term) =>
		ilike(tweet.text, `%${escapeLike(term)}%`)
	);
	if (filters.account) conditions.push(eq(tweet.accountId, filters.account));
	if (filters.kind === 'quote') conditions.push(isNotNull(tweet.quotedStatusId));
	else if (filters.kind !== 'all') conditions.push(eq(tweet.kind, filters.kind));
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

/** `<createdAt>_<id>`, prefixed with `<count>_` when sorting by likes or retweets. */
const CURSOR = /^(?:(\d{1,10})_)?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d+)$/;

const COUNT_SORTS = { likes: tweet.favoriteCount, retweets: tweet.retweetCount } as const;

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

export interface PagePosition {
	cursor: string | null;
	/** Start at this instant instead of a cursor (date sorts only): the first tweet of a month. */
	at?: string | null;
	/** `previous` returns the tweets just before the cursor in the sort order. */
	direction?: 'next' | 'previous';
}

function cursorOf(item: TweetView, sort: TweetFilters['sort']): string {
	const counted =
		sort === 'likes' ? item.favoriteCount : sort === 'retweets' ? item.retweetCount : undefined;
	return `${counted === undefined ? '' : `${counted}_`}${item.createdAt}_${item.id}`;
}

export async function listTweets(
	filters: TweetFilters,
	timeZone: string,
	{ cursor, at = null, direction = 'next' }: PagePosition,
	limit = PAGE_SIZE
): Promise<TweetPage> {
	const conditions = filterConditions(filters, timeZone);
	// Ties in a like or retweet count fall back to newest first, so every sort is a total order.
	const countColumn =
		filters.sort === 'likes' || filters.sort === 'retweets' ? COUNT_SORTS[filters.sort] : null;
	const backward = direction === 'previous';
	// Rows are fetched walking away from the cursor; a backward walk runs against the sort order.
	const ascending = (filters.sort === 'oldest') !== backward;
	const after = (row: SQL, position: SQL) =>
		ascending ? sql`${row} > ${position}` : sql`${row} < ${position}`;
	const position = cursor ? CURSOR.exec(cursor) : null;
	if (position) {
		const [, counted, createdAt, id] = position;
		if (countColumn && counted !== undefined)
			conditions.push(
				after(
					sql`(${countColumn}, ${tweet.createdAt}, ${tweet.id})`,
					sql`(${counted}::int, ${createdAt}::timestamptz, ${id})`
				)
			);
		else if (!countColumn)
			conditions.push(
				after(sql`(${tweet.createdAt}, ${tweet.id})`, sql`(${createdAt}::timestamptz, ${id})`)
			);
	} else if (at && !countColumn) {
		conditions.push(
			filters.sort === 'oldest'
				? sql`${tweet.createdAt} >= ${at}::timestamptz`
				: sql`${tweet.createdAt} < ${at}::timestamptz`
		);
	}

	const order = ascending ? asc : desc;
	const rows = await db
		.select({
			id: tweet.id,
			username: twitterAccount.username,
			displayName: twitterAccount.displayName,
			createdAt: tweet.createdAt,
			text: tweet.text,
			kind: tweet.kind,
			quote: sql<boolean>`${tweet.quotedStatusId} is not null`,
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
		.orderBy(...(countColumn ? [order(countColumn)] : []), order(tweet.createdAt), order(tweet.id))
		.limit(limit + 1);

	const more = rows.length > limit;
	const pageRows = rows.slice(0, limit);
	if (backward) pageRows.reverse();
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
	const first = items[0];
	const last = items.at(-1);
	// A page that started from a position may have tweets before it.
	const startedInside = position !== null || (at !== null && !countColumn);
	return {
		items,
		nextCursor: last && (backward || more) ? cursorOf(last, filters.sort) : null,
		previousCursor:
			first && (backward ? more : startedInside) ? cursorOf(first, filters.sort) : null
	};
}

/** Tweet counts per calendar month in the viewer's time zone, oldest first. */
export async function tweetMonths(filters: TweetFilters, timeZone: string): Promise<TweetMonth[]> {
	const where = and(...filterConditions(filters, timeZone)) ?? sql`true`;
	// The subquery names the month once; a repeated expression would get new parameter numbers.
	const rows = await db.execute<{
		month: string;
		start: Date | string;
		end: Date | string;
		total: number;
	}>(sql`
		select to_char(m, 'YYYY-MM') as month,
			(m at time zone ${timeZone}) as start,
			((m + interval '1 month') at time zone ${timeZone}) as "end",
			count(*)::int as total
		from (select date_trunc('month', ${tweet.createdAt} at time zone ${timeZone}) as m
			from ${tweet} where ${where}) months
		group by m order by m`);
	return rows.map((row) => ({
		month: row.month,
		start: new Date(row.start).toISOString(),
		end: new Date(row.end).toISOString(),
		total: row.total
	}));
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
