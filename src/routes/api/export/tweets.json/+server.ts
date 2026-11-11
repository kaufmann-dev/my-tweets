import { Readable } from 'node:stream';
import { createJsonExport, exportFileName } from '#lib/server/export.ts';
import { requireUser } from '#lib/server/require-user.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	requireUser();
	const stream = await createJsonExport();
	return new Response(Readable.toWeb(stream) as ReadableStream, {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${exportFileName('json')}"`,
			'cache-control': 'no-store'
		}
	});
};
