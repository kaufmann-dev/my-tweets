const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const number = new Intl.NumberFormat();

export function formatDateTime(iso: string): string {
	return dateTime.format(new Date(iso));
}

export function formatNumber(value: number): string {
	return number.format(value);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function tweetUrl(id: string): string {
	return `https://x.com/i/web/status/${id}`;
}

const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

/** Formats a calendar day (`YYYY-MM-DD`) without shifting it between time zones. */
export function formatDay(isoDay: string): string {
	return day.format(new Date(`${isoDay}T00:00:00Z`));
}

/** Formats a calendar month (`YYYY-MM`). */
export function formatMonth(isoMonth: string): string {
	return month.format(new Date(`${isoMonth}-01T00:00:00Z`));
}

/** The last day of a calendar month (`YYYY-MM`) as `YYYY-MM-DD`. */
export function lastDayOfMonth(isoMonth: string): string {
	const [year, monthNumber] = isoMonth.split('-').map(Number) as [number, number];
	return `${isoMonth}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Every month from `first` to `last` (`YYYY-MM`), so quiet months show up as gaps in the chart. */
export function monthRange(first: string, last: string): string[] {
	const months: string[] = [];
	let [year, month] = first.split('-').map(Number) as [number, number];
	const [lastYear, lastMonth] = last.split('-').map(Number) as [number, number];
	while (year < lastYear || (year === lastYear && month <= lastMonth)) {
		months.push(`${year}-${String(month).padStart(2, '0')}`);
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}
	return months;
}
