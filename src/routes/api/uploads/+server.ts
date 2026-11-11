import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { startUpload } from '#lib/server/imports.ts';
import { requireUser } from '#lib/server/require-user.ts';
import type { RequestHandler } from './$types';

const startSchema = z.object({
	fileName: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(/\.zip$/i, 'Only .zip files can be imported.'),
	size: z
		.number()
		.int()
		.positive()
		.max(64 * 1024 ** 3)
});

/** Starts a chunked upload of a Twitter archive or my-tweets export. */
export const POST: RequestHandler = async ({ request }) => {
	requireUser();
	const parsed = startSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid upload request.');
	const run = await startUpload(parsed.data.fileName, parsed.data.size);
	return Response.json({ id: run.id }, { status: 201 });
};
