import { appendFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { importRun } from '#lib/server/db/schema.ts';
import { applyImport, type ImportCounts } from '#lib/server/ingest/apply.ts';
import { isBundleManifest, readBundle } from '#lib/server/ingest/bundle.ts';
import { readTwitterArchive } from '#lib/server/ingest/twitter-archive.ts';
import { ImportFormatError } from '#lib/server/ingest/types.ts';
import { openZip } from '#lib/server/ingest/zip.ts';
import { ensureStorage, mediaDir, uploadPath, uploadsDir } from '#lib/server/storage.ts';

export type ImportRun = typeof importRun.$inferSelect;
type ImportKind = NonNullable<ImportRun['kind']>;

/** Uploads without a new chunk for this long are treated as abandoned. */
const ABANDONED_AFTER_MS = 30 * 60 * 1000;

const ACTIVE_STATUSES: ImportRun['status'][] = ['uploading', 'running'];

export async function listImportRuns(limit = 20): Promise<ImportRun[]> {
	return db.select().from(importRun).orderBy(desc(importRun.startedAt)).limit(limit);
}

export async function getImportRun(id: string): Promise<ImportRun> {
	if (!/^[0-9a-f-]{36}$/.test(id)) error(404, 'Import not found');
	const [run] = await db.select().from(importRun).where(eq(importRun.id, id));
	if (!run) error(404, 'Import not found');
	return run;
}

async function failRun(id: string, message: string): Promise<void> {
	await db
		.update(importRun)
		.set({ status: 'failed', error: message, finishedAt: new Date(), updatedAt: new Date() })
		.where(eq(importRun.id, id));
	await rm(uploadPath(id), { force: true });
}

export async function startUpload(fileName: string, size: number): Promise<ImportRun> {
	await ensureStorage();
	const abandoned = await db
		.select({ id: importRun.id })
		.from(importRun)
		.where(
			and(
				eq(importRun.status, 'uploading'),
				lt(importRun.updatedAt, new Date(Date.now() - ABANDONED_AFTER_MS))
			)
		);
	for (const run of abandoned) await failRun(run.id, 'The upload was abandoned.');

	const [active] = await db
		.select({ id: importRun.id })
		.from(importRun)
		.where(inArray(importRun.status, ACTIVE_STATUSES))
		.limit(1);
	if (active) error(409, 'Another import is still in progress. Wait for it to finish.');

	const [run] = await db
		.insert(importRun)
		.values({ fileName, size, status: 'uploading' })
		.returning();
	return run;
}

export async function appendChunk(id: string, offset: number, chunk: Uint8Array): Promise<number> {
	const run = await getImportRun(id);
	if (run.status !== 'uploading') error(409, 'This upload is no longer accepting data.');
	const path = uploadPath(id);
	const received = (await stat(path).catch(() => null))?.size ?? 0;
	if (offset !== received) error(409, `Expected offset ${received}.`);
	if (received + chunk.byteLength > run.size) error(400, 'The upload is larger than announced.');
	await appendFile(path, chunk);
	await db.update(importRun).set({ updatedAt: new Date() }).where(eq(importRun.id, id));
	return received + chunk.byteLength;
}

export async function cancelUpload(id: string): Promise<void> {
	const run = await getImportRun(id);
	if (run.status !== 'uploading') error(409, 'Only unfinished uploads can be cancelled.');
	await failRun(id, 'The upload was cancelled.');
}

/** Tells a Twitter archive from a my-tweets export by looking at the zip's entries. */
async function detectKind(path: string): Promise<ImportKind> {
	const zip = await openZip(path);
	try {
		if (zip.entries.has('manifest.json')) {
			let manifest: unknown = null;
			try {
				manifest = JSON.parse(await zip.readText('manifest.json'));
			} catch {
				// Not ours; fall through to the archive check.
			}
			if (isBundleManifest(manifest)) return 'bundle';
		}
		if ([...zip.entries.keys()].some((name) => /^([^/]+\/)?data\/account\.js$/.test(name)))
			return 'twitter-archive';
		throw new ImportFormatError('This zip is neither a Twitter archive nor a my-tweets export.');
	} finally {
		zip.close();
	}
}

async function runImport(run: ImportRun, kind: ImportKind): Promise<void> {
	const path = uploadPath(run.id);
	const progress = async (counts: ImportCounts) => {
		await db
			.update(importRun)
			.set({ ...counts, updatedAt: new Date() })
			.where(eq(importRun.id, run.id));
	};
	try {
		let counts: ImportCounts;
		if (kind === 'bundle') {
			const bundle = await readBundle(path);
			try {
				counts = await applyImport(
					{ accounts: bundle.accounts(), tweets: bundle.tweets(), mediaFiles: bundle.mediaFiles },
					progress
				);
			} finally {
				bundle.close();
			}
		} else {
			const archive = await readTwitterArchive(path, run.fileName);
			try {
				counts = await applyImport(
					{ accounts: [archive.account], tweets: archive.tweets, mediaFiles: archive.mediaFiles },
					progress
				);
			} finally {
				archive.close();
			}
		}
		await db
			.update(importRun)
			.set({ ...counts, status: 'done', finishedAt: new Date(), updatedAt: new Date() })
			.where(eq(importRun.id, run.id));
		await rm(path, { force: true });
	} catch (cause) {
		if (!(cause instanceof ImportFormatError)) console.error(`Import ${run.id} failed`, cause);
		await failRun(
			run.id,
			cause instanceof ImportFormatError
				? cause.message
				: 'The import failed unexpectedly. The server log has the details.'
		);
	}
}

/** Validates a finished upload and starts importing it in the background. */
export async function completeUpload(id: string): Promise<ImportRun> {
	const run = await getImportRun(id);
	if (run.status !== 'uploading') error(409, 'This upload was already completed.');
	const received = (await stat(uploadPath(id)).catch(() => null))?.size ?? 0;
	if (received !== run.size) error(409, `Only ${received} of ${run.size} bytes were received.`);

	let kind: ImportKind;
	try {
		kind = await detectKind(uploadPath(id));
	} catch (cause) {
		const message =
			cause instanceof ImportFormatError ? cause.message : 'The file could not be read.';
		await failRun(id, message);
		return getImportRun(id);
	}

	const [running] = await db
		.update(importRun)
		.set({ kind, status: 'running', updatedAt: new Date() })
		.where(and(eq(importRun.id, id), eq(importRun.status, 'uploading')))
		.returning();
	if (!running) error(409, 'This upload was already completed.');
	void runImport(running, kind);
	return running;
}

/** Called at startup: nothing can still be running, so finish what a restart interrupted. */
export async function recoverInterruptedImports(): Promise<void> {
	await ensureStorage();
	await db
		.update(importRun)
		.set({
			status: 'failed',
			error: 'Interrupted by a server restart.',
			finishedAt: new Date(),
			updatedAt: new Date()
		})
		.where(inArray(importRun.status, ACTIVE_STATUSES));
	for (const name of await readdir(uploadsDir)) await rm(join(uploadsDir, name), { force: true });
	for (const name of await readdir(mediaDir)) {
		if (name.endsWith('.part')) await rm(join(mediaDir, name), { force: true });
	}
}
