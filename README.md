# My Tweets

[Run Locally](#run-locally) · [Importing Data](#importing-data) · [Exporting](#exporting) ·
[Configuration](#configuration) · [Development](#development) ·
[Authentication Setup](#authentication-setup) · [Coolify Deployment](#coolify-deployment)

A private website for browsing every tweet from your Twitter/X archives. It merges official
archive downloads (every layout since 2019) and old spreadsheet exports into one searchable
timeline, keeps tweets that were later deleted on X, serves the archived photos and videos, and
exports everything as one backup file.

- Search, filter by account, type (tweets, replies, retweets), media and a date range (whole days
  in your time zone); sort by newest, oldest, most liked or most retweeted.
- Stats per account or for everything: totals, tweets per month, time of day, day of week, who you
  replied to most and your most liked tweets.
- Import new archives by uploading the zip from X. Tweets are merged by id and never removed.
- Export the whole archive as a zip with all media, which can be imported again to restore it, or
  as a single JSON file.

Every page requires signing in through an OpenID Connect provider (Pocket ID).

## Run Locally

Requires Node 24, pnpm 11, and Podman.

1. Install dependencies and create `.env` from the example:

   ```bash
   pnpm install
   cp .env.example .env
   ```

   Fill in the values described in [Configuration](#configuration). For local development use
   `DATABASE_URL="postgres://postgres:postgres@localhost:5432/my_tweets"` and
   `ORIGIN="http://localhost:5173"`.

2. Start PostgreSQL and create the database:

   ```bash
   podman run --name postgres-sveltekit \
     --env POSTGRES_PASSWORD=postgres \
     --publish 5432:5432 \
     --volume postgres-sveltekit-data:/var/lib/postgresql/data \
     --detach postgres:18-alpine
   podman exec postgres-sveltekit createdb -U postgres my_tweets
   ```

   If the `postgres-sveltekit` container already exists, run `podman start postgres-sveltekit`
   instead of `podman run`.

3. Start the app. Pending database migrations are applied automatically when the server starts.

   ```bash
   pnpm dev
   ```

Open the printed URL and sign in. Signing in needs a reachable OIDC provider; see
[Authentication Setup](#authentication-setup).

## Importing Data

### New Twitter archives

Download your archive from X (Settings → Your account → Download an archive of your data) and
upload the zip on the **Import** page. Uploads are sent in 8 MiB chunks, so large archives pass
through reverse proxies. The import runs in the background; progress and results appear on the
page.

Imports only ever add or improve information:

- Tweets are matched by id. Data from official archives wins over spreadsheet rows, and newer
  archives win over older ones.
- Tweets missing from a newer archive stay in the database, and a tweet marked as deleted stays
  marked.
- Photos and videos from `tweets_media`, `deleted_tweets_media` and `community_tweet_media` are
  stored. Direct message and Grok media are ignored.

### Old archives and spreadsheets

Older backups (archive zips in the pre-2023 `tweet.js` layout and spreadsheet exports with a
`Tweet Id` column) are converted locally into one bundle, which is then uploaded like an archive:

```bash
pnpm legacy:bundle ~/Documents/Backups/Twitter legacy.bundle.zip
```

The command scans the folder recursively for `twitter-*.zip` and `*.xlsx`, merges everything, and
prints a summary of tweets per account and skipped files. Spreadsheet screen names are linked to
the account ids found in the archives; screen names that never appear in an archive get their
own entry. Upload `legacy.bundle.zip` on the **Import** page.

## Exporting

The **Export** page offers two downloads, both streamed without buffering:

- **Full archive** (`my-tweets-YYYY-MM-DD.zip`): all tweets and media. Upload it on the Import
  page to restore everything.
- **Tweets only** (`my-tweets-YYYY-MM-DD.json`): one JSON document with all accounts and tweets,
  without media. It cannot be imported.

The full archive and the legacy bundle share one format (version 1):

| File            | Content                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| `manifest.json` | `{"format":"my-tweets","version":1,"exportedAt":…,"counts":{…}}`                  |
| `accounts.json` | JSON array of accounts, one per line                                              |
| `tweets.json`   | JSON array of tweets with their media list and original source data, one per line |
| `media/<file>`  | Media files named `<tweetId>-<mediaKey>.<ext>`                                    |

## Configuration

Set these variables in `.env` for development and in the deployment environment for production.

| Variable             | Required   | Purpose                                                                                                     |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Yes        | PostgreSQL connection string                                                                                |
| `ORIGIN`             | Yes        | Public base URL of the app, used by Better Auth                                                             |
| `BETTER_AUTH_SECRET` | Yes        | High-entropy secret for signing sessions, e.g. `openssl rand -base64 32`                                    |
| `OIDC_DISCOVERY_URL` | Yes        | Discovery document of the identity provider, e.g. `https://id.example.com/.well-known/openid-configuration` |
| `OIDC_CLIENT_ID`     | Yes        | Client ID of the confidential OIDC client                                                                   |
| `OIDC_CLIENT_SECRET` | Yes        | Client secret of the confidential OIDC client                                                               |
| `DATA_DIR`           | No         | Directory for media files and in-progress uploads; defaults to `./data`                                     |
| `BODY_SIZE_LIMIT`    | Production | Maximum request body for `node build`; must exceed the 8 MiB upload chunks, e.g. `16M`                      |

The OIDC discovery document is fetched when the server starts. If the provider is unreachable at
that moment, sign-in stays unavailable until the app is restarted.

## Development

```bash
pnpm dev                 # development server
pnpm check               # type check
pnpm lint                # Prettier and ESLint
pnpm test                # unit tests
pnpm build               # production build into build/
pnpm drizzle-kit generate # create a migration after changing src/lib/server/db/schema.ts
pnpm drizzle-kit migrate  # apply migrations without starting the app
pnpm auth:schema         # regenerate the Better Auth schema after changing auth config
```

On a fresh clone, run `pnpm build` once before `pnpm check` so Paraglide generates its runtime.

Code layout:

- `src/lib/server/ingest/` reads Twitter archives, spreadsheets and bundles, merges tweets, and
  writes bundles. Except for `apply.ts`, these modules run under plain Node, which the legacy CLI
  in `scripts/legacy-bundle.ts` relies on.
- `src/lib/server/imports.ts` handles chunked uploads and background imports;
  `src/lib/server/export.ts` streams the exports.
- `src/routes/(app)/` contains the signed-in pages, `src/routes/api/` the upload and export
  endpoints, and `src/routes/media/` serves media files.

Never commit archive data: `data/` and `*.bundle.zip` are ignored.

## Authentication Setup

Every page except `/login` requires a session. The login screen starts an OIDC Authorization
Code flow with PKCE against Pocket ID through Better Auth's generic OAuth plugin; the resulting
server-side session lasts seven days and is never extended. Signing out also ends the Pocket ID
session. This is a single-user app, so restrict access in the Pocket ID client.

- Public Client: Off
- Callback URL: `/api/auth/callback/pocket-id`
- Logout Callback URL: `/login`
- Environment variables: `ORIGIN`, `BETTER_AUTH_SECRET`, `OIDC_DISCOVERY_URL`,
  `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`, all required; see [Configuration](#configuration).

## Coolify Deployment

- **Build Pack:** Railpack
- **Base Directory:** `/`
- **Site type:** Dynamic (Node server started by `pnpm start`)
- **Ports Exposes:** `3000`
- **Persistent Storage:** a volume mounted at `/data` (media files and uploads)

Environment variables:

- Required, also **Available during build** (the build validates them):
  - `DATABASE_URL`: PostgreSQL connection string
  - `ORIGIN`: `https://tweets.kaufmann.dev`
  - `BETTER_AUTH_SECRET`: high-entropy session secret
  - `OIDC_DISCOVERY_URL`: Pocket ID discovery document URL
  - `OIDC_CLIENT_ID`: Pocket ID client ID
  - `OIDC_CLIENT_SECRET`: Pocket ID client secret
- Required at runtime:
  - `DATA_DIR`: `/data`, the persistent volume (code default `./data` is not persistent)
  - `BODY_SIZE_LIMIT`: `16M`, larger than the 8 MiB upload chunks (default 512K)
