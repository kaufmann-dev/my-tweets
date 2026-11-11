import { createWriteStream } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { createBundleStream, readBundle } from './bundle.ts';
import { writeTestZip, ytd } from './test-helpers.ts';
import { readTwitterArchive } from './twitter-archive.ts';
import { xlsxRowToTweet } from './xlsx.ts';

const account = ytd('account', [
	{ account: { accountId: '42', username: 'someone', accountDisplayName: 'Some One' } }
]);
const manifest = `window.__THAR_CONFIG = ${JSON.stringify({ archiveInfo: { generationDate: '2026-10-28T11:43:27.127Z' } })}`;

const photoTweet = {
	tweet: {
		id_str: '200',
		full_text: 'Look https://t.co/m',
		created_at: 'Tue Oct 27 13:23:25 +0000 2026',
		favorite_count: '4',
		retweet_count: '1',
		lang: 'en',
		source: '<a href="https://mobile.twitter.com">Twitter Web App</a>',
		entities: { urls: [], media: [{ url: 'https://t.co/m' }] },
		extended_entities: {
			media: [
				{
					type: 'photo',
					url: 'https://t.co/m',
					media_url_https: 'https://pbs.twimg.com/media/PHOTO1.jpg'
				}
			]
		}
	}
};

const replyTweet = {
	tweet: {
		id_str: '201',
		full_text: '@friend hi',
		created_at: 'Wed Oct 28 08:00:00 +0000 2026',
		in_reply_to_status_id_str: '150',
		in_reply_to_screen_name: 'friend',
		entities: { urls: [] }
	}
};

describe('readTwitterArchive', () => {
	it('reads the current archive layout with media and deleted tweets', async () => {
		const path = await writeTestZip({
			'data/manifest.js': manifest,
			'data/account.js': account,
			'data/tweets.js': ytd('tweets', [photoTweet, replyTweet]),
			'data/deleted-tweets.js': ytd('deleted_tweets', [
				{
					tweet: {
						id_str: '199',
						full_text: 'gone',
						created_at: 'Mon Oct 26 10:00:00 +0000 2026',
						deleted_at: 'Mon Oct 26 12:00:00 +0000 2026'
					}
				}
			]),
			'data/tweets_media/200-PHOTO1.jpg': Buffer.from('jpeg-bytes'),
			'data/direct_messages_media/999-SECRET.jpg': Buffer.from('ignored')
		});
		const archive = await readTwitterArchive(path);
		try {
			expect(archive.snapshotAt).toBe('2026-10-28T11:43:27.127Z');
			expect(archive.account).toMatchObject({ id: '42', username: 'someone' });
			const byId = new Map(archive.tweets.map((tweet) => [tweet.id, tweet]));
			expect(byId.get('200')).toMatchObject({
				text: 'Look',
				kind: 'tweet',
				favoriteCount: 4,
				source: 'Twitter Web App',
				media: [
					{
						mediaKey: 'PHOTO1',
						kind: 'photo',
						fileName: '200-PHOTO1.jpg',
						contentType: 'image/jpeg',
						bytes: 10
					}
				]
			});
			expect(byId.get('201')).toMatchObject({ kind: 'reply', inReplyToScreenName: 'friend' });
			expect(byId.get('199')?.deletedAt).toBe('2026-10-26T12:00:00.000Z');
			expect([...archive.mediaFiles.keys()]).toEqual(['200-PHOTO1.jpg']);
		} finally {
			archive.close();
		}
	});

	it('reads the pre-2023 layout inside a wrapping folder', async () => {
		const path = await writeTestZip({
			'export/data/account.js': account,
			'export/data/tweet.js': ytd('tweet', [replyTweet]),
			'export/data/deleted-tweet.js': ytd('deleted_tweet', [
				{
					tweet: {
						id: '300',
						text: 'RT @other: something',
						user_id: '42',
						media: [],
						share: { source_status_id: '1' },
						created_at: 'Sun Jun 05 14:23:04 +0000 2022',
						deleted_at: 'Tue Jun 07 21:25:31 +0000 2022'
					}
				}
			])
		});
		const archive = await readTwitterArchive(path, 'twitter-2022-06-19-abc.zip');
		try {
			expect(archive.snapshotAt).toBe('2022-06-19T00:00:00.000Z');
			const deleted = archive.tweets.find((tweet) => tweet.id === '300');
			expect(deleted).toMatchObject({
				kind: 'retweet',
				deletedAt: '2022-06-07T21:25:31.000Z',
				sourceRank: 1
			});
		} finally {
			archive.close();
		}
	});

	it('rejects zips that are not Twitter archives', async () => {
		const path = await writeTestZip({ 'readme.txt': 'hello' });
		await expect(readTwitterArchive(path)).rejects.toThrow(/not a Twitter archive/);
	});
});

describe('xlsxRowToTweet', () => {
	it('maps spreadsheet rows and expands links', () => {
		const tweet = xlsxRowToTweet(
			{
				'Tweet Id': '1368297451493416962',
				Text: 'A &amp; B https://t.co/link https://t.co/media',
				'Screen Name': 'someone',
				UTC: '2021-03-06T21:00:00.000Z',
				Favorites: '3',
				Retweets: '0',
				Language: 'de',
				Client: '<a href="x">Twitter for Android</a>',
				'Tweet Type': 'Tweet',
				URLs: 'https://example.com',
				'Media Type': 'photo',
				'Media URLs': 'https://pbs.twimg.com/media/Ev0qrOkXcAQuCtB.png'
			},
			'screen:someone',
			'2021-07-15T00:00:00.000Z'
		);
		expect(tweet).toMatchObject({
			text: 'A & B https://example.com',
			kind: 'tweet',
			favoriteCount: 3,
			source: 'Twitter for Android',
			sourceRank: 1,
			media: [
				{
					mediaKey: 'Ev0qrOkXcAQuCtB',
					remoteUrl: 'https://pbs.twimg.com/media/Ev0qrOkXcAQuCtB.png'
				}
			]
		});
	});

	it('skips rows without a valid id or date', () => {
		expect(
			xlsxRowToTweet({ 'Tweet Id': 'abc', UTC: '2021-01-01' }, '1', '2021-01-01T00:00:00.000Z')
		).toBeNull();
	});
});

describe('bundle', () => {
	it('round-trips accounts, tweets and media files', async () => {
		const archivePath = await writeTestZip({
			'data/account.js': account,
			'data/manifest.js': manifest,
			'data/tweets.js': ytd('tweets', [photoTweet, replyTweet]),
			'data/tweets_media/200-PHOTO1.jpg': Buffer.from('jpeg-bytes')
		});
		const archive = await readTwitterArchive(archivePath);
		const directory = await mkdtemp(join(tmpdir(), 'my-tweets-bundle-'));
		const bundlePath = join(directory, 'out.zip');
		try {
			await pipeline(
				createBundleStream({
					counts: { accounts: 1, tweets: archive.tweets.length, media: 1 },
					accounts: [archive.account],
					tweets: archive.tweets,
					mediaFiles: archive.mediaFiles.values()
				}),
				createWriteStream(bundlePath)
			);
		} finally {
			archive.close();
		}

		const bundle = await readBundle(bundlePath);
		try {
			expect(bundle.manifest).toMatchObject({ format: 'my-tweets', version: 1 });
			expect(await Array.fromAsync(bundle.accounts())).toEqual([archive.account]);
			expect(await Array.fromAsync(bundle.tweets())).toEqual(archive.tweets);
			const media = bundle.mediaFiles.get('200-PHOTO1.jpg');
			expect(media?.size).toBe(10);
			const chunks = await Array.fromAsync((await media!.open()) as Readable);
			expect(Buffer.concat(chunks).toString()).toBe('jpeg-bytes');
		} finally {
			bundle.close();
		}
	});

	it('rejects zips without a my-tweets manifest', async () => {
		const path = await writeTestZip({ 'manifest.json': '{"format":"other"}' });
		await expect(readBundle(path)).rejects.toThrow(/not a my-tweets export/);
	});
});
