import {
	ORIGIN,
	BETTER_AUTH_SECRET,
	OIDC_CLIENT_ID,
	OIDC_CLIENT_SECRET,
	OIDC_DISCOVERY_URL
} from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { OIDC_PROVIDER_ID } from '#lib/auth-provider.ts';

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: false },
	// Sessions end seven days after sign-in and are never extended.
	session: { expiresIn: 60 * 60 * 24 * 7, disableSessionRefresh: true },
	plugins: [
		// Single-user app: the identity provider's access policy decides who may sign in.
		// PKCE (S256) and client_secret_post are the plugin defaults.
		genericOAuth({
			config: [
				{
					providerId: OIDC_PROVIDER_ID,
					discoveryUrl: OIDC_DISCOVERY_URL,
					clientId: OIDC_CLIENT_ID,
					clientSecret: OIDC_CLIENT_SECRET,
					scopes: ['openid', 'profile', 'email']
				}
			]
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
