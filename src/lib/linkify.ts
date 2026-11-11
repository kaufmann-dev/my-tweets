export type TextSegment =
	{ type: 'text'; value: string } | { type: 'link'; value: string; href: string };

const TOKEN =
	/(https?:\/\/[^\s<>"]*[^\s<>".,:;'!?)\]])|(?<![\w@/])@(\w{1,15})|(?<![\w#&/])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;

/** Splits tweet text into plain text and links for URLs, @mentions and #hashtags. */
export function linkify(text: string): TextSegment[] {
	const segments: TextSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(TOKEN)) {
		const index = match.index;
		if (index > last) segments.push({ type: 'text', value: text.slice(last, index) });
		const [value, url, mention, hashtag] = match;
		const href = url
			? url
			: mention
				? `https://x.com/${mention}`
				: `https://x.com/hashtag/${encodeURIComponent(hashtag)}`;
		segments.push({ type: 'link', value, href });
		last = index + value.length;
	}
	if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
	return segments;
}
