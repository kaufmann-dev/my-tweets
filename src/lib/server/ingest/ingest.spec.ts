import { describe, expect, it } from 'vitest';
import { toIsoDate } from './dates.ts';
import { mediaKeyFromUrl, parseMediaFileName } from './media.ts';
import { mergeAccount, mergeTweet } from './merge.ts';
import { normalizeArchiveText, stripHtml } from './text.ts';
import { SOURCE_RANK, type NormalizedMedia, type NormalizedTweet } from './types.ts';
import { parseYtdArray, parseYtdValue } from './ytd.ts';

function tweet(overrides: Partial<NormalizedTweet> = {}): NormalizedTweet {
	return {
		id: '100',
		accountId: '1',
		createdAt: '2021-06-05T21:26:04.000Z',
		text: 'hello',
		kind: 'tweet',
		inReplyToStatusId: null,
		inReplyToScreenName: null,
		lang: 'en',
		source: null,
		favoriteCount: 0,
		retweetCount: 0,
		deletedAt: null,
		community: false,
		sourceRank: SOURCE_RANK.archive,
		snapshotAt: '2021-07-01T00:00:00.000Z',
		raw: {},
		media: [],
		...overrides
	};
}

function media(overrides: Partial<NormalizedMedia> = {}): NormalizedMedia {
	return {
		mediaKey: 'ABC',
		kind: 'photo',
		fileName: null,
		remoteUrl: 'https://pbs.twimg.com/media/ABC.jpg',
		contentType: null,
		bytes: null,
		position: 0,
		...overrides
	};
}

describe('parseYtd', () => {
	it('parses archive data files', () => {
		expect(parseYtdArray('window.YTD.tweets.part0 = [ {"a": 1} ]', 'tweets.js')).toEqual([
			{ a: 1 }
		]);
		expect(parseYtdValue('window.__THAR_CONFIG = {"x": "y"};', 'manifest.js')).toEqual({ x: 'y' });
	});

	it('rejects files that are not data files', () => {
		expect(() => parseYtdArray('no assignment', 'x.js')).toThrow(/not a Twitter archive/);
		expect(() => parseYtdArray('window.x = {"a":1}', 'x.js')).toThrow(/does not contain a list/);
	});
});

describe('toIsoDate', () => {
	it('parses Twitter dates with offsets', () => {
		expect(toIsoDate('Tue Oct 27 13:23:25 +0000 2026')).toBe('2026-10-27T13:23:25.000Z');
		expect(toIsoDate('Tue Oct 27 15:23:25 +0200 2026')).toBe('2026-10-27T13:23:25.000Z');
	});

	it('parses ISO dates and rejects garbage', () => {
		expect(toIsoDate('2021-06-05T21:26:04.000Z')).toBe('2021-06-05T21:26:04.000Z');
		expect(toIsoDate('yesterday')).toBeNull();
		expect(toIsoDate(undefined)).toBeNull();
	});
});

describe('text', () => {
	it('expands links, removes media links and decodes entities', () => {
		const text = normalizeArchiveText('Look &amp; see https://t.co/a https://t.co/m', {
			urls: [{ url: 'https://t.co/a', expanded_url: 'https://example.com/page' }],
			media: [{ url: 'https://t.co/m' }]
		});
		expect(text).toBe('Look & see https://example.com/page');
	});

	it('strips HTML from the client name', () => {
		expect(stripHtml('<a href="https://mobile.twitter.com">Twitter Web App</a>')).toBe(
			'Twitter Web App'
		);
		expect(stripHtml(undefined)).toBeNull();
	});
});

describe('media names', () => {
	it('parses archive media file names', () => {
		expect(parseMediaFileName('2110623466961469588-HUpw2oUWYAA3NMy.jpg')).toEqual({
			tweetId: '2110623466961469588',
			mediaKey: 'HUpw2oUWYAA3NMy',
			extension: 'jpg'
		});
		expect(parseMediaFileName('../etc/passwd')).toBeNull();
		expect(parseMediaFileName('1-a.exe')).toBeNull();
	});

	it('derives media keys from URLs', () => {
		expect(mediaKeyFromUrl('https://pbs.twimg.com/media/E3DPnVZXoAMkY7Z.jpg?name=orig')).toBe(
			'E3DPnVZXoAMkY7Z'
		);
	});
});

describe('mergeTweet', () => {
	it('prefers archive data over spreadsheet rows regardless of order', () => {
		const archive = tweet({ text: 'from archive', favoriteCount: 3 });
		const sheet = tweet({
			text: 'from sheet',
			favoriteCount: 9,
			sourceRank: SOURCE_RANK.spreadsheet,
			snapshotAt: '2030-01-01T00:00:00.000Z'
		});
		expect(mergeTweet(archive, sheet).text).toBe('from archive');
		expect(mergeTweet(sheet, archive).text).toBe('from archive');
	});

	it('prefers the newer snapshot within the same rank', () => {
		const older = tweet({ favoriteCount: 1 });
		const newer = tweet({ favoriteCount: 5, snapshotAt: '2022-01-01T00:00:00.000Z' });
		expect(mergeTweet(newer, older).favoriteCount).toBe(5);
		expect(mergeTweet(older, newer).favoriteCount).toBe(5);
	});

	it('keeps deletion marks and the earliest deletion date', () => {
		const deleted = tweet({ deletedAt: '2022-02-01T00:00:00.000Z' });
		const later = tweet({ snapshotAt: '2023-01-01T00:00:00.000Z' });
		expect(mergeTweet(deleted, later).deletedAt).toBe('2022-02-01T00:00:00.000Z');
		expect(mergeTweet(deleted, tweet({ deletedAt: '2021-12-01T00:00:00.000Z' })).deletedAt).toBe(
			'2021-12-01T00:00:00.000Z'
		);
	});

	it('keeps local media files over remote-only entries', () => {
		const remote = tweet({
			snapshotAt: '2023-01-01T00:00:00.000Z',
			media: [media()]
		});
		const local = tweet({
			media: [media({ fileName: '100-ABC.jpg', contentType: 'image/jpeg', bytes: 10 })]
		});
		expect(mergeTweet(local, remote).media).toEqual([
			media({ fileName: '100-ABC.jpg', contentType: 'image/jpeg', bytes: 10 })
		]);
	});

	it('prefers a real account over a spreadsheet pseudo account', () => {
		const sheet = tweet({
			accountId: 'screen:someone',
			sourceRank: SOURCE_RANK.spreadsheet
		});
		expect(
			mergeTweet(
				sheet,
				tweet({ sourceRank: SOURCE_RANK.spreadsheet, snapshotAt: '2000-01-01T00:00:00.000Z' })
			).accountId
		).toBe('1');
	});
});

describe('mergeAccount', () => {
	it('unions usernames and keeps the newest name', () => {
		const merged = mergeAccount(
			{
				id: '1',
				username: 'old',
				displayName: 'Old',
				usernames: ['old'],
				snapshotAt: '2020-01-01T00:00:00.000Z'
			},
			{
				id: '1',
				username: 'new',
				displayName: 'New',
				usernames: ['new'],
				snapshotAt: '2021-01-01T00:00:00.000Z'
			}
		);
		expect(merged).toEqual({
			id: '1',
			username: 'new',
			displayName: 'New',
			usernames: ['old', 'new'],
			snapshotAt: '2021-01-01T00:00:00.000Z'
		});
	});
});
