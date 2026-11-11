import { requireUser } from '#lib/server/require-user.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	const user = requireUser();
	return { user: { name: user.name, email: user.email } };
};
