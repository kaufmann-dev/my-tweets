interface UrlEntity {
	url?: string;
	expanded_url?: string;
}

interface Entities {
	urls?: UrlEntity[];
	media?: UrlEntity[];
}

/** Twitter escapes only these three characters in tweet text. */
export function decodeTwitterEntities(text: string): string {
	return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Expands t.co links to their targets and removes the t.co links that only point at attached media. */
export function normalizeArchiveText(fullText: string, entities: Entities | undefined): string {
	let text = fullText;
	for (const media of entities?.media ?? []) {
		if (media.url) text = text.split(media.url).join('');
	}
	for (const link of entities?.urls ?? []) {
		if (link.url && link.expanded_url) text = text.split(link.url).join(link.expanded_url);
	}
	return decodeTwitterEntities(text).trim();
}

/** Turns `<a href="…">Twitter Web App</a>` into `Twitter Web App`. */
export function stripHtml(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = decodeTwitterEntities(value.replace(/<[^>]*>/g, '')).trim();
	return text === '' ? null : text;
}
