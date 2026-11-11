import { describe, expect, it } from 'vitest';
import { monthAtFraction, monthOffsets, orderMonths, scrubberMarks } from './timeline-scrubber.ts';

const months = [
	{ month: '2023-11', total: 10 },
	{ month: '2023-12', total: 30 },
	{ month: '2024-01', total: 40 },
	{ month: '2024-02', total: 20 }
];

describe('orderMonths', () => {
	it('shows the newest month first when sorting newest first', () => {
		expect(orderMonths(months, 'newest').map((m) => m.month)).toEqual([
			'2024-02',
			'2024-01',
			'2023-12',
			'2023-11'
		]);
		expect(orderMonths(months, 'oldest')).toBe(months);
	});
});

describe('monthOffsets', () => {
	it('counts the tweets before each month', () => {
		expect(monthOffsets(months)).toEqual([0, 10, 40, 80]);
	});
});

describe('monthAtFraction', () => {
	const offsets = monthOffsets(months);

	it('maps the ends of the track to the first and last month', () => {
		expect(monthAtFraction(months, offsets, 100, 0)).toBe(0);
		expect(monthAtFraction(months, offsets, 100, 1)).toBe(3);
		expect(monthAtFraction(months, offsets, 100, -0.5)).toBe(0);
		expect(monthAtFraction(months, offsets, 100, 2)).toBe(3);
	});

	it('switches months exactly at their first tweet', () => {
		expect(monthAtFraction(months, offsets, 100, 0.09)).toBe(0);
		expect(monthAtFraction(months, offsets, 100, 0.1)).toBe(1);
		expect(monthAtFraction(months, offsets, 100, 0.399)).toBe(1);
		expect(monthAtFraction(months, offsets, 100, 0.4)).toBe(2);
		expect(monthAtFraction(months, offsets, 100, 0.8)).toBe(3);
	});

	it('returns -1 without months', () => {
		expect(monthAtFraction([], [], 0, 0.5)).toBe(-1);
	});
});

describe('scrubberMarks', () => {
	it('places months by their share of the tweets', () => {
		const marks = scrubberMarks(months, monthOffsets(months), 100, 1000);
		expect(marks).toEqual([
			{ index: 0, y: 0, kind: 'year', label: '2023' },
			{ index: 1, y: 100, kind: 'dot' },
			{ index: 2, y: 400, kind: 'year', label: '2024' },
			{ index: 3, y: 800, kind: 'dot' }
		]);
	});

	it('labels the year where it starts in display order', () => {
		const newest = orderMonths(months, 'newest');
		const marks = scrubberMarks(newest, monthOffsets(newest), 100, 1000);
		expect(marks.filter((mark) => mark.kind === 'year')).toEqual([
			{ index: 0, y: 0, kind: 'year', label: '2024' },
			{ index: 2, y: 600, kind: 'year', label: '2023' }
		]);
	});

	it('drops marks that crowd the one above', () => {
		const marks = scrubberMarks(months, monthOffsets(months), 100, 40);
		// Dots need 8 px and labels 24 px: 2023 at 0, the December dot at 4 is dropped,
		// 2024 at 16 is too close for a label but becomes a dot, February at 32 follows it.
		expect(marks).toEqual([
			{ index: 0, y: 0, kind: 'year', label: '2023' },
			{ index: 2, y: 16, kind: 'dot' },
			{ index: 3, y: 32, kind: 'dot' }
		]);
	});

	it('returns no marks before the track has a height', () => {
		expect(scrubberMarks(months, monthOffsets(months), 100, 0)).toEqual([]);
	});
});
