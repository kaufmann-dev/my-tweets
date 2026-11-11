import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	OIDC_DISCOVERY_URL: {
		description:
			'OpenID Connect discovery document of the identity provider, e.g. `https://id.example.com/.well-known/openid-configuration`.'
	},
	OIDC_CLIENT_ID: { description: 'Client ID of the confidential OIDC client.' },
	OIDC_CLIENT_SECRET: { description: 'Client secret of the confidential OIDC client.' },
	DATA_DIR: {
		description:
			'Directory for media files and in-progress uploads. Must be persistent storage in production. Defaults to `./data`.',
		schema: (value) => (value && value.trim() !== '' ? value : './data')
	}
});
