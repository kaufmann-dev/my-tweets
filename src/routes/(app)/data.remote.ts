import { query } from '$app/server';
import { z } from 'zod';
import { listImportRuns } from '#lib/server/imports.ts';
import { requireUser } from '#lib/server/require-user.ts';
import {
	archiveStats,
	countTweets as countMatchingTweets,
	listAccounts,
	listTweets as listTweetPage
} from '#lib/server/tweets.ts';
import { tweetFiltersSchema } from '#lib/tweet-filters.ts';

export const listTweets = query(
	tweetFiltersSchema.extend({ cursor: z.string().max(100).nullable() }),
	async ({ cursor, ...filters }) => {
		requireUser();
		return listTweetPage(filters, cursor);
	}
);

export const countTweets = query(tweetFiltersSchema, async (filters) => {
	requireUser();
	return countMatchingTweets(filters);
});

export const getAccounts = query(async () => {
	requireUser();
	return listAccounts();
});

export const getArchiveStats = query(async () => {
	requireUser();
	return archiveStats();
});

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
