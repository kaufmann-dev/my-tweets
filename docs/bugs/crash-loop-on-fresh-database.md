# Crash loop on a fresh database (Coolify 503)

- Fixed: 2026-11-11 21:28:11 CET (+0100)
- Commit before the fix: `0ad04be71eb750e694f5e5a040a21263181f5da5`

## Symptom

The first Coolify deployment answered every request with the proxy's 503 page. The container
crash-looped with `DrizzleQueryError: Failed query: update "import_run" ...` caused by
`PostgresError: relation "import_run" does not exist`, raised from `recoverInterruptedImports` in
the server `init` hook.

Separately, after SIGTERM the server stopped listening but the process never exited, so stopping
or redeploying waited until the container runtime killed it.

## Root cause

- Migrations ran only as a Coolify post-deployment command, which needs a running container. On a
  fresh database the `init` hook queried `import_run` before any migration existed, the process
  exited, and the post-deployment migration never got a chance to run.
- The postgres.js pool was never closed on shutdown. adapter-node closes the HTTP server on
  SIGTERM, but the open database connections kept the event loop alive.

Both were reproduced locally with `node build`: against an empty database the process exited with
code 1 and the same error, and after SIGTERM it stayed alive for minutes.

## Changes

- Added `src/lib/server/db/migrate.ts` (`runMigrations`, drizzle-orm's postgres-js migrator over
  `drizzle/`), called first in the `init` hook of `src/hooks.server.ts`. It shares the
  `drizzle.__drizzle_migrations` table with `drizzle-kit migrate`, so existing databases are not
  migrated twice.
- `src/lib/server/db/index.ts` closes the pool on adapter-node's `sveltekit:shutdown` event.
- Removed the Coolify post-deployment migration command from `README.md` and documented the
  startup migration in `README.md` and `AGENTS.md`.

Verified: a fresh database gets both migrations and all tables and the server serves `/login`;
an already-migrated database starts without re-running migrations; both exit about 0.3 s after
SIGTERM.
