/** Shapes returned by the timeline queries and rendered by the client. */

export interface TweetMediaView {
	key: string;
	src: string;
	isVideo: boolean;
	local: boolean;
}

export interface TweetView {
	id: string;
	username: string;
	displayName: string;
	createdAt: string;
	text: string;
	kind: 'tweet' | 'reply' | 'retweet';
	inReplyToScreenName: string | null;
	inReplyToStatusId: string | null;
	favoriteCount: number;
	retweetCount: number;
	community: boolean;
	source: string | null;
	media: TweetMediaView[];
}

export interface TweetPage {
	items: TweetView[];
	nextCursor: string | null;
}

export interface AccountOption {
	id: string;
	username: string;
	displayName: string;
	usernames: string[];
	tweets: number;
}

export interface NamedTotal {
	name: string;
	total: number;
}

export interface TweetStats {
	tweets: number;
	originals: number;
	replies: number;
	retweets: number;
	/** Likes and retweets the tweets received. */
	likes: number;
	retweeted: number;
	activeDays: number;
	withMedia: number;
	busiestDay: { day: string; total: number } | null;
	/** Every month between the first and last tweet, as `YYYY-MM`. */
	months: { month: string; total: number }[];
	/** Totals per hour of day (0–23) and per weekday (Monday first). */
	hours: number[];
	weekdays: number[];
	repliedTo: NamedTotal[];
	clients: NamedTotal[];
	topLiked: TweetView[];
}
