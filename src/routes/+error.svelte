<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';

	const messages: Record<number, { title: string; description: string }> = {
		401: {
			title: 'Sign-in required',
			description: 'Your session has ended. Sign in again to continue.'
		},
		403: {
			title: 'Access denied',
			description: 'You do not have permission to open this page.'
		},
		404: {
			title: 'Page not found',
			description: 'This page does not exist. Check the address or go back to your tweets.'
		},
		500: {
			title: 'Something went wrong',
			description: 'The server ran into a problem. Please try again in a moment.'
		}
	};

	const message = $derived(
		messages[page.status] ??
			(page.status >= 500
				? messages[500]
				: { title: 'Request failed', description: 'This request could not be completed.' })
	);
</script>

<svelte:head>
	<title>{message.title} · My Tweets</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center px-4 py-10">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<p class="text-sm text-muted-foreground tabular-nums">Error {page.status}</p>
			<Card.Title>{message.title}</Card.Title>
			<Card.Description>{message.description}</Card.Description>
		</Card.Header>
		<Card.Footer>
			{#if page.status === 401}
				<Button href={resolve('/login')}>Sign in</Button>
			{:else}
				<Button href={resolve('/(app)')}>Back to tweets</Button>
			{/if}
		</Card.Footer>
	</Card.Root>
</div>
