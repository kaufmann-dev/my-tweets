import { createWriteStream } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

/** Writes a zip with the given entries to a fresh temporary directory and returns its path. */
export async function writeTestZip(entries: Record<string, string | Buffer>): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'my-tweets-test-'));
	const path = join(directory, 'test.zip');
	const zip = new yazl.ZipFile();
	for (const [name, content] of Object.entries(entries)) {
		zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
	}
	zip.end();
	await pipeline(zip.outputStream, createWriteStream(path));
	return path;
}

export function ytd(name: string, items: unknown): string {
	return `window.YTD.${name}.part0 = ${JSON.stringify(items, null, 2)}`;
}
