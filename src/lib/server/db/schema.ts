import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Twitter accounts. Spreadsheet-only screen names use the pseudo id `screen:<lowercase name>`. */
export const twitterAccount = pgTable('twitter_account', {
	id: text('id').primaryKey(),
	username: text('username').notNull(),
	displayName: text('display_name').notNull(),
	usernames: text('usernames').array().notNull(),
	snapshotAt: timestamptz('snapshot_at').notNull()
});

export const tweet = pgTable(
	'tweet',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => twitterAccount.id),
		createdAt: timestamptz('created_at').notNull(),
		text: text('text').notNull(),
		kind: text('kind', { enum: ['tweet', 'reply', 'retweet'] }).notNull(),
		inReplyToStatusId: text('in_reply_to_status_id'),
		inReplyToScreenName: text('in_reply_to_screen_name'),
		lang: text('lang'),
		source: text('source'),
		favoriteCount: integer('favorite_count').notNull().default(0),
		retweetCount: integer('retweet_count').notNull().default(0),
		deletedAt: timestamptz('deleted_at'),
		community: boolean('community').notNull().default(false),
		sourceRank: smallint('source_rank').notNull(),
		snapshotAt: timestamptz('snapshot_at').notNull(),
		raw: jsonb('raw').notNull()
	},
	(table) => [
		index('tweet_created_at_id_idx').on(table.createdAt.desc(), table.id.desc()),
		index('tweet_account_id_idx').on(table.accountId),
		index('tweet_text_trgm_idx').using('gin', sql`${table.text} gin_trgm_ops`)
	]
);

export const tweetMedia = pgTable(
	'tweet_media',
	{
		tweetId: text('tweet_id')
			.notNull()
			.references(() => tweet.id, { onDelete: 'cascade' }),
		mediaKey: text('media_key').notNull(),
		kind: text('kind', { enum: ['photo', 'video', 'gif'] }).notNull(),
		fileName: text('file_name'),
		remoteUrl: text('remote_url'),
		contentType: text('content_type'),
		bytes: bigint('bytes', { mode: 'number' }),
		position: smallint('position').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.tweetId, table.mediaKey] }),
		index('tweet_media_file_name_idx').on(table.fileName)
	]
);

export const importRun = pgTable('import_run', {
	id: uuid('id').primaryKey().defaultRandom(),
	kind: text('kind', { enum: ['twitter-archive', 'bundle'] }),
	fileName: text('file_name').notNull(),
	size: bigint('size', { mode: 'number' }).notNull(),
	status: text('status', { enum: ['uploading', 'running', 'done', 'failed'] }).notNull(),
	startedAt: timestamptz('started_at').notNull().defaultNow(),
	updatedAt: timestamptz('updated_at').notNull().defaultNow(),
	finishedAt: timestamptz('finished_at'),
	tweetsAdded: integer('tweets_added').notNull().default(0),
	tweetsUpdated: integer('tweets_updated').notNull().default(0),
	mediaAdded: integer('media_added').notNull().default(0),
	error: text('error')
});

export * from './auth.schema';
