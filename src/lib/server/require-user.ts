import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';

/** Remote functions and endpoints check the session themselves; see the SvelteKit auth guidance. */
export function requireUser() {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Sign in required');
	return locals.user;
}
