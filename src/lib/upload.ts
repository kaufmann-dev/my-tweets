/** Chunk size for uploads; the server's BODY_SIZE_LIMIT must be larger than this. */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export interface ImportRunStatus {
	id: string;
	status: 'uploading' | 'running' | 'done' | 'failed';
	tweetsAdded: number;
	tweetsUpdated: number;
	mediaAdded: number;
	error: string | null;
}

async function failure(response: Response): Promise<Error> {
	const body = (await response.json().catch(() => null)) as { message?: string } | null;
	return new Error(body?.message ?? `The server responded with ${response.status}.`);
}

async function putChunk(id: string, offset: number, chunk: Blob): Promise<number> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const response = await fetch(`/api/uploads/${id}?offset=${offset}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/octet-stream' },
				body: chunk
			});
			if (response.ok) return ((await response.json()) as { received: number }).received;
			if (response.status < 500) throw await failure(response);
			lastError = await failure(response);
		} catch (error) {
			if (error instanceof Error && !(error instanceof TypeError)) throw error;
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
	}
	throw lastError instanceof Error ? lastError : new Error('The upload failed.');
}

/** Uploads a file in chunks, then asks the server to import it. Returns the started import run. */
export async function uploadForImport(
	file: File,
	onProgress: (fraction: number) => void
): Promise<ImportRunStatus> {
	const start = await fetch('/api/uploads', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ fileName: file.name, size: file.size })
	});
	if (!start.ok) throw await failure(start);
	const { id } = (await start.json()) as { id: string };

	try {
		let offset = 0;
		while (offset < file.size) {
			offset = await putChunk(id, offset, file.slice(offset, offset + UPLOAD_CHUNK_BYTES));
			onProgress(offset / file.size);
		}
	} catch (error) {
		// Free the import slot instead of leaving an unfinished upload behind.
		await fetch(`/api/uploads/${id}`, { method: 'DELETE' }).catch(() => undefined);
		throw error;
	}

	const complete = await fetch(`/api/uploads/${id}/complete`, { method: 'POST' });
	if (!complete.ok && complete.status !== 422) throw await failure(complete);
	return (await complete.json()) as ImportRunStatus;
}

export async function fetchImportRun(id: string): Promise<ImportRunStatus> {
	const response = await fetch(`/api/uploads/${id}`);
	if (!response.ok) throw await failure(response);
	return (await response.json()) as ImportRunStatus;
}
