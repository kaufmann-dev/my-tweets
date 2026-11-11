import { redirect } from '@sveltejs/kit';
import { safeRedirectTarget } from '#lib/redirect.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const redirectTo = safeRedirectTarget(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);
	return { redirectTo, failed: url.searchParams.has('error') };
};
