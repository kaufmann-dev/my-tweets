import type { MediaKind } from './types.ts';

const CONTENT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	mp4: 'video/mp4',
	mov: 'video/quicktime'
};

/** Media file names are `<tweetId>-<mediaKey>.<ext>`; this also guards the media route against path traversal. */
export const MEDIA_FILE_NAME = /^(\d+)-([A-Za-z0-9_-]+)\.(jpg|jpeg|png|gif|webp|mp4|mov)$/;

export function parseMediaFileName(
	fileName: string
): { tweetId: string; mediaKey: string; extension: string } | null {
	const match = MEDIA_FILE_NAME.exec(fileName);
	if (!match) return null;
	return { tweetId: match[1], mediaKey: match[2], extension: match[3].toLowerCase() };
}

export function contentTypeForFile(fileName: string): string | null {
	const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
	return CONTENT_TYPES[extension] ?? null;
}

export function mediaKindForFile(fileName: string): MediaKind {
	return contentTypeForFile(fileName)?.startsWith('video/') ? 'video' : 'photo';
}

/** `https://pbs.twimg.com/media/HUpw2oUWYAA3NMy.jpg?name=orig` → `HUpw2oUWYAA3NMy` */
export function mediaKeyFromUrl(url: string): string | null {
	const path = url.split(/[?#]/)[0];
	const base = path.slice(path.lastIndexOf('/') + 1);
	const key = base.replace(/\.[A-Za-z0-9]+$/, '');
	return /^[A-Za-z0-9_-]+$/.test(key) ? key : null;
}
