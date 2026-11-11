<script lang="ts">
	import { resolve } from '$app/paths';
	import LogIn from '@lucide/svelte/icons/log-in';
	import { authClient } from '#lib/auth-client.ts';
	import { OIDC_PROVIDER_ID } from '#lib/auth-provider.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let starting = $state(false);
	let startFailed = $state(false);

	async function signIn() {
		starting = true;
		startFailed = false;
		const { error } = await authClient.signIn.social({
			provider: OIDC_PROVIDER_ID,
			callbackURL: data.redirectTo,
			errorCallbackURL: `${resolve('/login')}?error=1`
		});
		if (error) {
			startFailed = true;
			starting = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in · My Tweets</title>
</svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title>My Tweets</Card.Title>
			<Card.Description>Sign in to browse your tweet archive.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if data.failed || startFailed}
				<Alert.Root variant="destructive">
					<Alert.Title>Sign-in did not complete</Alert.Title>
					<Alert.Description>Please try again.</Alert.Description>
				</Alert.Root>
			{/if}
			<Button onclick={signIn} disabled={starting} class="w-full">
				{#if starting}<Spinner aria-hidden="true" />{:else}<LogIn aria-hidden="true" />{/if}
				Sign in
			</Button>
		</Card.Content>
	</Card.Root>

	<footer class="flex gap-4 text-sm text-muted-foreground">
		<a
			class="hover:text-foreground hover:underline"
			href="https://legal.kaufmann.dev/imprint?site=tweets.kaufmann.dev"
		>
			Imprint
		</a>
		<a
			class="hover:text-foreground hover:underline"
			href="https://legal.kaufmann.dev/privacy?site=tweets.kaufmann.dev"
		>
			Privacy
		</a>
	</footer>
</div>
