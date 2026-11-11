import { Readable } from 'node:stream';
import { createArchiveExport, exportFileName } from '#lib/server/export.ts';
import { requireUser } from '#lib/server/require-user.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	requireUser();
	const stream = await createArchiveExport();
	return new Response(Readable.toWeb(stream) as ReadableStream, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${exportFileName('zip')}"`,
			'cache-control': 'no-store'
		}
	});
};
