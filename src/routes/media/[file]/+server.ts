import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { contentTypeForFile, parseMediaFileName } from '#lib/server/ingest/media.ts';
import { parseRange } from '#lib/server/range.ts';
import { requireUser } from '#lib/server/require-user.ts';
import { mediaDir } from '#lib/server/storage.ts';
import type { RequestHandler } from './$types';

/** Serves archived photos and videos, with range support so videos can seek. */
export const GET: RequestHandler = async ({ params, request }) => {
	requireUser();
	if (!parseMediaFileName(params.file)) error(404, 'Not found');
	const path = join(mediaDir, params.file);
	const info = await stat(path).catch(() => null);
	if (!info?.isFile()) error(404, 'Not found');

	const headers = new Headers({
		'content-type': contentTypeForFile(params.file) ?? 'application/octet-stream',
		'accept-ranges': 'bytes',
		'cache-control': 'private, max-age=31536000, immutable'
	});
	const range = parseRange(request.headers.get('range'), info.size);
	if (range === 'unsatisfiable') {
		headers.set('content-range', `bytes */${info.size}`);
		return new Response(null, { status: 416, headers });
	}
	const { start, end } = range ?? { start: 0, end: info.size - 1 };
	headers.set('content-length', String(end - start + 1));
	if (range) headers.set('content-range', `bytes ${start}-${end}/${info.size}`);
	const stream = createReadStream(path, { start, end });
	return new Response(Readable.toWeb(stream) as ReadableStream, {
		status: range ? 206 : 200,
		headers
	});
};
