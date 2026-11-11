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
	/** Quotes another tweet; the quoted tweet itself is only a link in the text. */
	quote: boolean;
	inReplyToScreenName: string | null;
	inReplyToStatusId: string | null;
	favoriteCount: number;
	retweetCount: number;
	community: boolean;
	source: string | null;
	media: TweetMediaView[];
}

export interface TweetPage {
	/** Always in the sort order, also for a `previous` page. */
	items: TweetView[];
	/** Continue after the last item; null at the end. */
	nextCursor: string | null;
	/** Continue before the first item; null when nothing can come before it. */
	previousCursor: string | null;
}

/** Tweets in one calendar month of the viewer's time zone. */
export interface TweetMonth {
	/** `YYYY-MM`. */
	month: string;
	/** The month's first instant and the next month's first instant, as ISO timestamps. */
	start: string;
	end: string;
	total: number;
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
	quotes: number;
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
