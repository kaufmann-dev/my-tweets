export type ByteRange = { start: number; end: number };

/**
 * Parses a single-range `Range` header (`bytes=0-499`, `bytes=500-`, `bytes=-500`).
 * Returns null when there is no usable header (serve the whole file) and 'unsatisfiable'
 * when the range lies outside the file. Multiple ranges are served as the whole file.
 */
export function parseRange(
	header: string | null,
	size: number
): ByteRange | null | 'unsatisfiable' {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (match[1] === '' && match[2] === '')) return null;
	let start: number;
	let end: number;
	if (match[1] === '') {
		const suffix = Number(match[2]);
		if (suffix === 0) return 'unsatisfiable';
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
	}
	if (start >= size || start > end) return 'unsatisfiable';
	return { start, end };
}
