const MONTHS: Record<string, number> = {
	Jan: 0,
	Feb: 1,
	Mar: 2,
	Apr: 3,
	May: 4,
	Jun: 5,
	Jul: 6,
	Aug: 7,
	Sep: 8,
	Oct: 9,
	Nov: 10,
	Dec: 11
};

const TWITTER_DATE =
	/^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2}) (\d{4})$/;

/**
 * Converts a Twitter date (`Tue Oct 27 13:23:25 +0000 2026`) or an ISO 8601 string to a
 * normalized ISO 8601 UTC string. Returns null when the value cannot be parsed.
 */
export function toIsoDate(value: unknown): string | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
	if (typeof value !== 'string' || value.trim() === '') return null;
	const text = value.trim();
	const match = TWITTER_DATE.exec(text);
	if (match) {
		const [, month, day, hours, minutes, seconds, sign, offsetHours, offsetMinutes, year] = match;
		const monthIndex = MONTHS[month];
		if (monthIndex === undefined) return null;
		const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * (sign === '-' ? -1 : 1);
		const utc =
			Date.UTC(
				Number(year),
				monthIndex,
				Number(day),
				Number(hours),
				Number(minutes),
				Number(seconds)
			) -
			offset * 60_000;
		return new Date(utc).toISOString();
	}
	if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
	const date = new Date(text);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function minIsoDate(a: string | null, b: string | null): string | null {
	if (a === null) return b;
	if (b === null) return a;
	return a < b ? a : b;
}
