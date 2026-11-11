CREATE TABLE "import_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text,
	"file_name" text NOT NULL,
	"size" bigint NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"tweets_added" integer DEFAULT 0 NOT NULL,
	"tweets_updated" integer DEFAULT 0 NOT NULL,
	"media_added" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "tweet" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"kind" text NOT NULL,
	"in_reply_to_status_id" text,
	"in_reply_to_screen_name" text,
	"lang" text,
	"source" text,
	"favorite_count" integer DEFAULT 0 NOT NULL,
	"retweet_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"community" boolean DEFAULT false NOT NULL,
	"source_rank" smallint NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tweet_media" (
	"tweet_id" text NOT NULL,
	"media_key" text NOT NULL,
	"kind" text NOT NULL,
	"file_name" text,
	"remote_url" text,
	"content_type" text,
	"bytes" bigint,
	"position" smallint NOT NULL,
	CONSTRAINT "tweet_media_tweet_id_media_key_pk" PRIMARY KEY("tweet_id","media_key")
);
--> statement-breakpoint
CREATE TABLE "twitter_account" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"usernames" text[] NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tweet" ADD CONSTRAINT "tweet_account_id_twitter_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."twitter_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tweet_media" ADD CONSTRAINT "tweet_media_tweet_id_tweet_id_fk" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tweet_created_at_id_idx" ON "tweet" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tweet_account_id_idx" ON "tweet" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "tweet_text_trgm_idx" ON "tweet" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tweet_media_file_name_idx" ON "tweet_media" USING btree ("file_name");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");