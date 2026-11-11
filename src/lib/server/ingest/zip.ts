import type { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { ImportFormatError } from './types.ts';

export interface ZipReader {
	/** File entries keyed by their path inside the zip; directories are omitted. */
	entries: Map<string, yauzl.Entry>;
	open(name: string): Promise<Readable>;
	readText(name: string): Promise<string>;
	close(): void;
}

export async function openZip(path: string): Promise<ZipReader> {
	let zip: yauzl.ZipFile;
	try {
		zip = await yauzl.openPromise(path, { lazyEntries: true, autoClose: false });
	} catch {
		throw new ImportFormatError('The file is not a readable zip archive.');
	}
	const entries = new Map<string, yauzl.Entry>();
	for await (const entry of zip.eachEntry()) {
		if (!entry.fileName.endsWith('/')) entries.set(entry.fileName, entry);
	}

	async function open(name: string): Promise<Readable> {
		const entry = entries.get(name);
		if (!entry) throw new ImportFormatError(`${name} is missing from the zip archive.`);
		return zip.openReadStreamPromise(entry);
	}

	return {
		entries,
		open,
		async readText(name) {
			const chunks: Buffer[] = [];
			for await (const chunk of await open(name)) chunks.push(chunk as Buffer);
			return Buffer.concat(chunks)
				.toString('utf8')
				.replace(/^\uFEFF/, '');
		},
		close() {
			zip.close();
		}
	};
}
