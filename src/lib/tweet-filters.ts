import { z } from 'zod';

export const KIND_FILTERS = ['all', 'tweet', 'reply', 'retweet'] as const;
export const SORTS = ['newest', 'oldest'] as const;

const isoDay = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
	.or(z.literal(''))
	.default('');

export const tweetFiltersSchema = z.object({
	q: z.string().trim().max(200).default(''),
	account: z.string().max(120).default(''),
	kind: z.enum(KIND_FILTERS).default('all'),
	media: z.boolean().default(false),
	/** Inclusive date range (`YYYY-MM-DD`) in the viewer's time zone; empty means unbounded. */
	from: isoDay,
	to: isoDay,
	sort: z.enum(SORTS).default('newest')
});

function isTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** IANA time zone the date range is interpreted in; sent by the browser, not stored in the URL. */
export const timeZoneSchema = z.string().max(64).refine(isTimeZone).default('UTC');

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
