import { describe, expect, it } from 'vitest';
import { lastDayOfMonth, monthRange } from './format.ts';
import { linkify } from './linkify.ts';
import { presentTweet } from './tweet-text.ts';
import { safeRedirectTarget } from './redirect.ts';
import { parseRange } from './server/range.ts';
import {
	DEFAULT_FILTERS,
	filtersFromParams,
	filtersToParams,
	searchTerms,
	timeZoneSchema
} from './tweet-filters.ts';

describe('safeRedirectTarget', () => {
	it('keeps same-origin paths', () => {
		expect(safeRedirectTarget('/import?x=1#y')).toBe('/import?x=1#y');
	});

	it('rejects external, protocol-relative and auth targets', () => {
		for (const target of [
			'https://evil.example',
			'//evil.example',
			'/\\evil.example',
			'javascript:alert(1)',
			'/login',
			'/api/auth/sign-out',
			'',
			null
		]) {
			expect(safeRedirectTarget(target)).toBe('/');
		}
	});
});

describe('linkify', () => {
	it('links URLs, mentions and hashtags', () => {
		expect(linkify('Hi @someone, see https://example.com/a. #Tag ok')).toEqual([
			{ type: 'text', value: 'Hi ' },
			{ type: 'link', value: '@someone', href: 'https://x.com/someone' },
			{ type: 'text', value: ', see ' },
			{ type: 'link', value: 'https://example.com/a', href: 'https://example.com/a' },
			{ type: 'text', value: '. ' },
			{ type: 'link', value: '#Tag', href: 'https://x.com/hashtag/Tag' },
			{ type: 'text', value: ' ok' }
		]);
	});

	it('does not link e-mail addresses', () => {
		expect(linkify('mail me@example.com')).toEqual([
			{ type: 'text', value: 'mail me@example.com' }
		]);
	});
});

describe('tweet filters', () => {
	it('round-trips through URL parameters', () => {
		const filters = {
			...DEFAULT_FILTERS,
			q: 'cats',
			kind: 'reply' as const,
			media: true,
			from: '2021-06-01',
			to: '2021-06-30'
		};
		expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
		expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
	});

	it('ignores invalid values', () => {
		expect(
			filtersFromParams(new URLSearchParams('kind=nope&from=2021-13-01&to=2021-02-30x&sort=oldest'))
		).toEqual({
			...DEFAULT_FILTERS,
			sort: 'oldest'
		});
	});

	it('accepts IANA time zones only', () => {
		expect(timeZoneSchema.safeParse('Europe/Berlin').success).toBe(true);
		expect(timeZoneSchema.safeParse("UTC'; drop table tweet; --").success).toBe(false);
	});

	it('accepts the quote type', () => {
		expect(filtersFromParams(new URLSearchParams('kind=quote')).kind).toBe('quote');
	});

	it('accepts the like and retweet sorts', () => {
		expect(filtersFromParams(new URLSearchParams('sort=likes')).sort).toBe('likes');
		expect(filtersFromParams(new URLSearchParams('sort=retweets')).sort).toBe('retweets');
	});

	it('splits search terms', () => {
		expect(searchTerms('  a  b a ')).toEqual(['a', 'b']);
	});
});

describe('presentTweet', () => {
	const base = {
		kind: 'tweet' as const,
		quote: false,
		inReplyToScreenName: null,
		inReplyToStatusId: null
	};

	it('moves the retweet prefix into a context line', () => {
		expect(presentTweet({ ...base, kind: 'retweet', text: 'RT @someone: hello' })).toEqual({
			text: 'hello',
			contexts: [
				{ type: 'retweet', targets: [{ username: 'someone', href: 'https://x.com/someone' }] }
			]
		});
	});

	it('moves leading mentions of a reply and links the parent tweet', () => {
		const result = presentTweet({
			...base,
			kind: 'reply',
			text: '@a @b hi @c',
			inReplyToScreenName: 'A',
			inReplyToStatusId: '42'
		});
		expect(result.text).toBe('hi @c');
		expect(result.contexts[0]?.targets).toEqual([
			{ username: 'a', href: 'https://x.com/a/status/42' },
			{ username: 'b', href: 'https://x.com/b' }
		]);
	});

	it('keeps a reply that is only mentions readable', () => {
		const result = presentTweet({ ...base, kind: 'reply', text: '@a', inReplyToScreenName: 'a' });
		expect(result.text).toBe('');
		expect(result.contexts[0]?.targets.map((target) => target.username)).toEqual(['a']);
	});

	it('moves the link of a quote into a context line', () => {
		expect(
			presentTweet({ ...base, quote: true, text: 'look https://twitter.com/who/status/123?s=20' })
		).toEqual({
			text: 'look',
			contexts: [
				{ type: 'quote', targets: [{ username: 'who', href: 'https://x.com/who/status/123' }] }
			]
		});
	});

	it('leaves plain tweets alone', () => {
		expect(presentTweet({ ...base, text: '@a is great' })).toEqual({
			text: '@a is great',
			contexts: []
		});
	});
});

describe('month helpers', () => {
	it('lists every month in a range, across years', () => {
		expect(monthRange('2020-11', '2021-02')).toEqual(['2020-11', '2020-12', '2021-01', '2021-02']);
		expect(monthRange('2021-05', '2021-05')).toEqual(['2021-05']);
	});

	it('finds the last day of a month', () => {
		expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
		expect(lastDayOfMonth('2023-02')).toBe('2023-02-28');
		expect(lastDayOfMonth('2021-12')).toBe('2021-12-31');
	});
});

describe('parseRange', () => {
	it('parses single byte ranges', () => {
		expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
		expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
		expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
		expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
	});

	it('handles missing and unsatisfiable ranges', () => {
		expect(parseRange(null, 100)).toBeNull();
		expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
		expect(parseRange('bytes=200-', 100)).toBe('unsatisfiable');
	});
});
