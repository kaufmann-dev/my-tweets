import { error } from '@sveltejs/kit';
import { appendChunk, cancelUpload, getImportRun } from '#lib/server/imports.ts';
import { requireUser } from '#lib/server/require-user.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	requireUser();
	const run = await getImportRun(params.id);
	return Response.json(run);
};

/** Appends one chunk at `?offset=<bytes already received>`. */
export const PUT: RequestHandler = async ({ params, request, url }) => {
	requireUser();
	const offset = Number(url.searchParams.get('offset'));
	if (!Number.isSafeInteger(offset) || offset < 0) error(400, 'A valid offset is required.');
	const chunk = new Uint8Array(await request.arrayBuffer());
	if (chunk.byteLength === 0) error(400, 'The chunk is empty.');
	const received = await appendChunk(params.id, offset, chunk);
	return Response.json({ received });
};

/** Cancels an unfinished upload so a new import can start right away. */
export const DELETE: RequestHandler = async ({ params }) => {
	requireUser();
	await cancelUpload(params.id);
	return new Response(null, { status: 204 });
};
