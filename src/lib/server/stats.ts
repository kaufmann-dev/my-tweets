import { sql } from 'drizzle-orm';
import { monthRange } from '#lib/format.ts';
import { db } from '#lib/server/db/index.ts';
import { tweet, tweetMedia, twitterAccount } from '#lib/server/db/schema.ts';
import { listTweets } from '#lib/server/tweets.ts';
import { DEFAULT_FILTERS } from '#lib/tweet-filters.ts';
import type { TweetStats } from '#lib/tweet-types.ts';

const TOP_TWEETS = 3;

/** Aggregates for the stats page. Days, hours and months are in the viewer's time zone. */
export async function tweetStats(account: string, timeZone: string): Promise<TweetStats> {
	const where = account ? sql`${tweet.accountId} = ${account}` : sql`true`;
	const local = sql`(${tweet.createdAt} at time zone ${timeZone})`;
	// Grouping by position: a repeated expression gets new parameter numbers and would not match.
	const [totals, media, months, hours, weekdays, busiest, repliedTo, clients, topLiked] =
		await Promise.all([
			db.execute<{
				tweets: number;
				originals: number;
				replies: number;
				retweets: number;
				quotes: number;
				likes: number;
				retweeted: number;
				active_days: number;
			}>(sql`
				select count(*)::int as tweets,
					(count(*) filter (where ${tweet.kind} = 'tweet'))::int as originals,
					(count(*) filter (where ${tweet.kind} = 'reply'))::int as replies,
					(count(*) filter (where ${tweet.kind} = 'retweet'))::int as retweets,
					count(${tweet.quotedStatusId})::int as quotes,
					coalesce(sum(${tweet.favoriteCount}), 0)::int as likes,
					coalesce(sum(${tweet.retweetCount}), 0)::int as retweeted,
					count(distinct ${local}::date)::int as active_days
				from ${tweet} where ${where}`),
			db.execute<{ total: number }>(sql`
				select count(*)::int as total from ${tweet}
				where ${where} and exists (
					select 1 from ${tweetMedia} where ${tweetMedia.tweetId} = ${tweet.id})`),
			db.execute<{ key: string; total: number }>(sql`
				select to_char(${local}, 'YYYY-MM') as key, count(*)::int as total
				from ${tweet} where ${where} group by 1 order by 1`),
			db.execute<{ key: number; total: number }>(sql`
				select extract(hour from ${local})::int as key, count(*)::int as total
				from ${tweet} where ${where} group by 1`),
			db.execute<{ key: number; total: number }>(sql`
				select extract(isodow from ${local})::int as key, count(*)::int as total
				from ${tweet} where ${where} group by 1`),
			db.execute<{ day: string; total: number }>(sql`
				select ${local}::date::text as day, count(*)::int as total
				from ${tweet} where ${where} group by 1 order by 2 desc, 1 limit 1`),
			// Threads are replies to yourself; they would otherwise top the list.
			db.execute<{ name: string; total: number }>(sql`
				select lower(${tweet.inReplyToScreenName}) as name, count(*)::int as total
				from ${tweet}
				where ${where} and ${tweet.kind} = 'reply' and ${tweet.inReplyToScreenName} is not null
					and lower(${tweet.inReplyToScreenName}) not in (
						select lower(unnest(${twitterAccount.usernames})) from ${twitterAccount})
				group by 1 order by 2 desc, 1 limit 10`),
			db.execute<{ name: string; total: number }>(sql`
				select ${tweet.source} as name, count(*)::int as total
				from ${tweet} where ${where} and ${tweet.source} <> ''
				group by 1 order by 2 desc, 1 limit 5`),
			listTweets({ ...DEFAULT_FILTERS, account, sort: 'likes' }, timeZone, null, TOP_TWEETS)
		]);

	const monthTotals = new Map(months.map((row) => [row.key, row.total]));
	const hourTotals = new Map(hours.map((row) => [row.key, row.total]));
	const weekdayTotals = new Map(weekdays.map((row) => [row.key, row.total]));
	const firstMonth = months[0]?.key;
	const lastMonth = months.at(-1)?.key;
	const summary = totals[0];

	return {
		tweets: summary?.tweets ?? 0,
		originals: summary?.originals ?? 0,
		replies: summary?.replies ?? 0,
		retweets: summary?.retweets ?? 0,
		quotes: summary?.quotes ?? 0,
		likes: summary?.likes ?? 0,
		retweeted: summary?.retweeted ?? 0,
		activeDays: summary?.active_days ?? 0,
		withMedia: media[0]?.total ?? 0,
		busiestDay: busiest[0] ? { day: busiest[0].day, total: busiest[0].total } : null,
		months:
			firstMonth && lastMonth
				? monthRange(firstMonth, lastMonth).map((month) => ({
						month,
						total: monthTotals.get(month) ?? 0
					}))
				: [],
		hours: Array.from({ length: 24 }, (_, hour) => hourTotals.get(hour) ?? 0),
		// Monday first.
		weekdays: Array.from({ length: 7 }, (_, index) => weekdayTotals.get(index + 1) ?? 0),
		repliedTo: repliedTo.map((row) => ({ name: row.name, total: row.total })),
		clients: clients.map((row) => ({ name: row.name, total: row.total })),
		topLiked: topLiked.items.filter((item) => item.favoriteCount > 0)
	};
}
