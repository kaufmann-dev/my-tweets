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
