<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { authClient } from '#lib/auth-client.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		{ href: resolve('/(app)'), label: 'Tweets' },
		{ href: resolve('/(app)/import'), label: 'Import' },
		{ href: resolve('/(app)/export'), label: 'Export' }
	];

	let signingOut = $state(false);

	async function signOut() {
		signingOut = true;
		try {
			await authClient.signOut({ callbackURL: resolve('/login') });
		} finally {
			signingOut = false;
		}
	}
</script>

<div class="min-h-dvh">
	<header class="sticky top-0 z-10 border-b bg-background">
		<div class="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
			<a href={resolve('/(app)')} class="mr-2 hidden font-semibold sm:block">My Tweets</a>
			<nav class="flex min-w-0 flex-1 items-center gap-1" aria-label="Main">
				{#each links as link (link.href)}
					<Button
						href={link.href}
						variant={page.url.pathname === link.href ? 'secondary' : 'ghost'}
						size="sm"
						aria-current={page.url.pathname === link.href ? 'page' : undefined}
					>
						{link.label}
					</Button>
				{/each}
			</nav>
			<Button variant="ghost" size="icon-sm" onclick={toggleMode} title="Toggle dark mode">
				<Sun class="dark:hidden" aria-hidden="true" />
				<Moon class="hidden dark:block" aria-hidden="true" />
				<span class="sr-only">Toggle dark mode</span>
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				onclick={signOut}
				disabled={signingOut}
				title={`Sign out ${data.user.email}`}
			>
				<LogOut aria-hidden="true" />
				<span class="sr-only">Sign out</span>
			</Button>
		</div>
	</header>

	<main class="mx-auto max-w-2xl px-4 py-6">
		<svelte:boundary>
			{@render children()}

			{#snippet pending()}
				<div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-28 w-full" />
					<Skeleton class="h-28 w-full" />
				</div>
			{/snippet}

			{#snippet failed(error, reset)}
				<Alert.Root variant="destructive">
					<Alert.Title>This page could not be loaded</Alert.Title>
					<Alert.Description>
						<p>
							{(error as App.Error | undefined)?.message ?? 'Check your connection and try again.'}
						</p>
						<Button variant="outline" size="sm" class="mt-2" onclick={reset}>Try again</Button>
					</Alert.Description>
				</Alert.Root>
			{/snippet}
		</svelte:boundary>
	</main>
</div>
