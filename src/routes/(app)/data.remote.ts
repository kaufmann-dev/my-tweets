import { query } from '$app/server';
import { z } from 'zod';
import { listImportRuns } from '#lib/server/imports.ts';
import { requireUser } from '#lib/server/require-user.ts';
import { tweetStats } from '#lib/server/stats.ts';
import {
	archiveStats,
	countTweets as countMatchingTweets,
	listAccounts,
	listTweets as listTweetPage
} from '#lib/server/tweets.ts';
import { timeZoneSchema, tweetFiltersSchema } from '#lib/tweet-filters.ts';

export const listTweets = query(
	tweetFiltersSchema.extend({ timeZone: timeZoneSchema, cursor: z.string().max(100).nullable() }),
	async ({ timeZone, cursor, ...filters }) => {
		requireUser();
		return listTweetPage(filters, timeZone, cursor);
	}
);

export const countTweets = query(
	tweetFiltersSchema.extend({ timeZone: timeZoneSchema }),
	async ({ timeZone, ...filters }) => {
		requireUser();
		return countMatchingTweets(filters, timeZone);
	}
);

export const getAccounts = query(async () => {
	requireUser();
	return listAccounts();
});

export const getArchiveStats = query(async () => {
	requireUser();
	return archiveStats();
});

export const getTweetStats = query(
	z.object({ account: tweetFiltersSchema.shape.account, timeZone: timeZoneSchema }),
	async ({ account, timeZone }) => {
		requireUser();
		return tweetStats(account, timeZone);
	}
);

export const getImportRuns = query(async () => {
	requireUser();
	const runs = await listImportRuns();
	return runs.map((run) => ({
		...run,
		startedAt: run.startedAt.toISOString(),
		updatedAt: run.updatedAt.toISOString(),
		finishedAt: run.finishedAt?.toISOString() ?? null
	}));
});
