import { building } from '$app/env';
import { auth } from '#lib/server/auth.ts';
import { recoverInterruptedImports } from '#lib/server/imports.ts';
import { safeRedirectTarget } from '#lib/redirect.ts';
import { redirect } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence
} from '@sveltejs/kit/hooks';
import { deLocalizeUrl, getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

export const init: ServerInit = async () => {
	if (!building) await recoverInterruptedImports();
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/** Everything except the sign-in screen and the auth endpoints requires a session. */
const handleAccess: Handle = ({ event, resolve }) => {
	const path = deLocalizeUrl(event.url).pathname;
	if (event.locals.user || path === '/login' || path.startsWith('/api/auth/'))
		return resolve(event);
	if (path.startsWith('/api/') || path.startsWith('/media/') || path.startsWith('/_app/'))
		return Response.json({ message: 'Sign in required' }, { status: 401 });
	redirect(
		303,
		`/login?redirectTo=${encodeURIComponent(safeRedirectTarget(path + event.url.search))}`
	);
};

export const handle: Handle = sequence(handleParaglide, handleBetterAuth, handleAccess);

export const handleError: HandleServerError = ({ kind, error }) => {
	if (kind === 'unknown') {
		console.error(error);
		return { message: 'Something went wrong on our side.' };
	}
	return error;
};
