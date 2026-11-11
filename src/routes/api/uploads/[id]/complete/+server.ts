import { completeUpload } from '#lib/server/imports.ts';
import { requireUser } from '#lib/server/require-user.ts';
import type { RequestHandler } from './$types';

/** Finishes an upload; the import then runs in the background and can be polled. */
export const POST: RequestHandler = async ({ params }) => {
	requireUser();
	const run = await completeUpload(params.id);
	return Response.json(run, { status: run.status === 'failed' ? 422 : 202 });
};
