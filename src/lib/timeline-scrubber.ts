/** Layout for the timeline scrubber: months are spaced by their share of the tweets. */

export interface ScrubberMonth {
	/** `YYYY-MM`. */
	month: string;
	total: number;
}

export interface ScrubberMark {
	/** Index into the months in display order. */
	index: number;
	/** Pixels from the top of the track. */
	y: number;
	kind: 'year' | 'dot';
	label?: string;
}

const YEAR_GAP = 24;
const DOT_GAP = 8;

/** The months in the order the timeline shows them. */
export function orderMonths<T extends ScrubberMonth>(months: T[], sort: string): T[] {
	return sort === 'newest' ? months.toReversed() : months;
}

/** The number of tweets shown before each month. */
export function monthOffsets(months: ScrubberMonth[]): number[] {
	let before = 0;
	return months.map((month) => {
		const offset = before;
		before += month.total;
		return offset;
	});
}

/** The month that holds the tweet at `fraction` (0–1) of the timeline. */
export function monthAtFraction(
	months: ScrubberMonth[],
	offsets: number[],
	total: number,
	fraction: number
): number {
	if (months.length === 0) return -1;
	const tweet = Math.min(Math.max(Math.floor(fraction * total), 0), total - 1);
	let low = 0;
	let high = months.length - 1;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if ((offsets[middle] ?? 0) <= tweet) low = middle;
		else high = middle - 1;
	}
	return low;
}

/**
 * A label where each year starts in display order and a dot per month, dropping marks that
 * would crowd the one above them.
 */
export function scrubberMarks(
	months: ScrubberMonth[],
	offsets: number[],
	total: number,
	height: number
): ScrubberMark[] {
	if (height <= 0 || total <= 0) return [];
	const marks: ScrubberMark[] = [];
	let lastLabel = -Infinity;
	let lastMark = -Infinity;
	months.forEach((month, index) => {
		const y = ((offsets[index] ?? 0) / total) * height;
		const year = month.month.slice(0, 4);
		if (year !== months[index - 1]?.month.slice(0, 4) && y - lastLabel >= YEAR_GAP) {
			marks.push({ index, y, kind: 'year', label: year });
			lastLabel = y;
			lastMark = y;
		} else if (y - lastMark >= DOT_GAP) {
			marks.push({ index, y, kind: 'dot' });
			lastMark = y;
		}
	});
	return marks;
}
