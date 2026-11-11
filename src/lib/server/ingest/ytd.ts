import { ImportFormatError } from './types.ts';

/** Parses a Twitter archive data file such as `window.YTD.tweets.part0 = [ ... ]`. */
export function parseYtdValue(source: string, fileName: string): unknown {
	const start = source.indexOf('=');
	if (start < 0) throw new ImportFormatError(`${fileName} is not a Twitter archive data file.`);
	const body = source
		.slice(start + 1)
		.trim()
		.replace(/;$/, '');
	try {
		return JSON.parse(body);
	} catch {
		throw new ImportFormatError(`${fileName} contains invalid JSON.`);
	}
}

export function parseYtdArray(source: string, fileName: string): unknown[] {
	const value = parseYtdValue(source, fileName);
	if (!Array.isArray(value)) throw new ImportFormatError(`${fileName} does not contain a list.`);
	return value;
}
