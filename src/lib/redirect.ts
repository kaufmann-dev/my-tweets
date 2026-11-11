/**
 * Returns `target` when it is a same-origin path (with optional query and hash), otherwise `/`.
 * Rejects absolute URLs, protocol-relative URLs (`//evil.example`) and backslash tricks.
 */
export function safeRedirectTarget(target: string | null | undefined): string {
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\'))
		return '/';
	try {
		const url = new URL(target, 'http://localhost');
		if (url.origin !== 'http://localhost') return '/';
		if (url.pathname === '/login' || url.pathname.startsWith('/api/')) return '/';
		return url.pathname + url.search + url.hash;
	} catch {
		return '/';
	}
}
