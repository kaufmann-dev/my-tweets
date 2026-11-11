import { z } from 'zod';

export const KIND_FILTERS = ['all', 'tweet', 'reply', 'retweet'] as const;
export const DELETED_FILTERS = ['include', 'only', 'exclude'] as const;
export const SORTS = ['newest', 'oldest'] as const;

export const tweetFiltersSchema = z.object({
	q: z.string().trim().max(200).default(''),
	account: z.string().max(120).default(''),
	kind: z.enum(KIND_FILTERS).default('all'),
	media: z.boolean().default(false),
	deleted: z.enum(DELETED_FILTERS).default('include'),
	/** `YYYY-MM`: newest-first lists start at the end of this month, oldest-first at its start. */
	month: z
		.string()
		.regex(/^\d{4}-(0[1-9]|1[0-2])$/)
		.or(z.literal(''))
		.default(''),
	sort: z.enum(SORTS).default('newest')
});

export type TweetFilters = z.infer<typeof tweetFiltersSchema>;

export const DEFAULT_FILTERS: TweetFilters = tweetFiltersSchema.parse({});

/** Reads filters from the URL, falling back to defaults for anything invalid. */
export function filtersFromParams(params: Pick<URLSearchParams, 'get'>): TweetFilters {
	const result = { ...DEFAULT_FILTERS };
	for (const key of Object.keys(DEFAULT_FILTERS) as (keyof TweetFilters)[]) {
		const raw = params.get(key);
		if (raw === null) continue;
		const value = key === 'media' ? raw === '1' : raw;
		const parsed = tweetFiltersSchema.shape[key].safeParse(value);
		if (parsed.success) Object.assign(result, { [key]: parsed.data });
	}
	return result;
}

/** Serializes only non-default filters so URLs stay short. */
export function filtersToParams(filters: TweetFilters): URLSearchParams {
	const params = new URLSearchParams();
	for (const key of Object.keys(DEFAULT_FILTERS) as (keyof TweetFilters)[]) {
		const value = filters[key];
		if (value === DEFAULT_FILTERS[key]) continue;
		params.set(key, typeof value === 'boolean' ? '1' : value);
	}
	return params;
}

/** Splits a search query into at most ten distinct terms. */
export function searchTerms(query: string): string[] {
	return [...new Set(query.split(/\s+/).filter(Boolean))].slice(0, 10);
}
