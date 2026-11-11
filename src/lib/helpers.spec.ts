import { describe, expect, it } from 'vitest';
import { linkify } from './linkify.ts';
import { safeRedirectTarget } from './redirect.ts';
import { parseRange } from './server/range.ts';
import {
	DEFAULT_FILTERS,
	filtersFromParams,
	filtersToParams,
	searchTerms
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
			month: '2021-06'
		};
		expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
		expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
	});

	it('ignores invalid values', () => {
		expect(filtersFromParams(new URLSearchParams('kind=nope&month=2021-13&sort=oldest'))).toEqual({
			...DEFAULT_FILTERS,
			sort: 'oldest'
		});
	});

	it('splits search terms', () => {
		expect(searchTerms('  a  b a ')).toEqual(['a', 'b']);
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
