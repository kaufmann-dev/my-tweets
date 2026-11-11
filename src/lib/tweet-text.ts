import type { TweetView } from './tweet-types.ts';

export interface TweetContext {
	type: 'reply' | 'retweet' | 'quote';
	/** Accounts the tweet is addressed to, with a link to the tweet or profile. */
	targets: { username: string; href: string }[];
}

export interface PresentedTweet {
	/** Tweet text without the parts the context lines already say. */
	text: string;
	contexts: TweetContext[];
}

const RETWEET_PREFIX = /^RT @(\w{1,15}):\s?/;
const LEADING_MENTIONS = /^(?:@\w{1,15}(?:\s+|$))+/;
const TRAILING_TWEET_LINK =
	/\s*https?:\/\/(?:mobile\.)?(?:twitter|x)\.com\/(\w+)\/status\/(\d+)\S*\s*$/;

const profileUrl = (username: string) => `https://x.com/${username}`;
const statusUrl = (username: string, id: string) => `https://x.com/${username}/status/${id}`;

/**
 * Moves what X writes into the text for technical reasons into context lines: the `RT @name:`
 * prefix of retweets, the mentions a reply starts with, and the link a quote ends with.
 */
export function presentTweet(
	tweet: Pick<TweetView, 'text' | 'kind' | 'quote' | 'inReplyToScreenName' | 'inReplyToStatusId'>
): PresentedTweet {
	let text = tweet.text;
	const contexts: TweetContext[] = [];

	if (tweet.kind === 'retweet') {
		const match = RETWEET_PREFIX.exec(text);
		if (match?.[1]) {
			text = text.slice(match[0].length);
			contexts.push({
				type: 'retweet',
				targets: [{ username: match[1], href: profileUrl(match[1]) }]
			});
		} else contexts.push({ type: 'retweet', targets: [] });
	}

	if (tweet.kind === 'reply') {
		const mentions = LEADING_MENTIONS.exec(text)?.[0] ?? '';
		text = text.slice(mentions.length);
		const names: string[] = [...(mentions.match(/\w+/g) ?? [])];
		const parent = tweet.inReplyToScreenName;
		if (parent && !names.some((name) => name.toLowerCase() === parent.toLowerCase()))
			names.unshift(parent);
		const seen = new Set<string>();
		contexts.push({
			type: 'reply',
			targets: names
				.filter((name) => {
					const key = name.toLowerCase();
					return !seen.has(key) && seen.add(key);
				})
				.map((username) => ({
					username,
					href:
						tweet.inReplyToStatusId && username.toLowerCase() === parent?.toLowerCase()
							? statusUrl(username, tweet.inReplyToStatusId)
							: profileUrl(username)
				}))
		});
	}

	if (tweet.quote) {
		const match = TRAILING_TWEET_LINK.exec(text);
		if (match?.[1] && match[2]) {
			text = text.slice(0, match.index);
			contexts.push({
				type: 'quote',
				targets: [{ username: match[1], href: statusUrl(match[1], match[2]) }]
			});
		}
	}

	return { text, contexts };
}
