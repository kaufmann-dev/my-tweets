<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SearchIcon from '@lucide/svelte/icons/search';
	import TweetCard from '#lib/components/tweet-card.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { formatNumber } from '#lib/format.ts';
	import {
		DEFAULT_FILTERS,
		filtersFromParams,
		filtersToParams,
		KIND_FILTERS,
		type TweetFilters
	} from '#lib/tweet-filters.ts';
	import type { TweetPage } from '#lib/tweet-types.ts';
	import { countTweets, getAccounts, getArchiveStats, listTweets } from './data.remote';

	const KIND_LABELS: Record<TweetFilters['kind'], string> = {
		all: 'All',
		tweet: 'Tweets',
		reply: 'Replies',
		retweet: 'Retweets'
	};

	const filters = $derived(filtersFromParams(page.url.searchParams));
	const filterKey = $derived(filtersToParams(filters).toString());
	const hasFilters = $derived(filterKey !== '');

	const [firstPage, total, accounts, stats] = $derived(
		await Promise.all([
			listTweets({ ...filters, cursor: null }),
			countTweets(filters),
			getAccounts(),
			getArchiveStats()
		])
	);

	// Pages loaded with "Load more" belong to the filters they were loaded for.
	let extra = $state.raw<{ key: string; pages: TweetPage[] }>({ key: '', pages: [] });
	const extraPages = $derived(extra.key === filterKey ? extra.pages : []);
	const items = $derived([firstPage, ...extraPages].flatMap((result) => result.items));
	const nextCursor = $derived((extraPages.at(-1) ?? firstPage).nextCursor);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);

	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		const key = filterKey;
		const cursor = nextCursor;
		loadingMore = true;
		loadMoreFailed = false;
		try {
			const next = await listTweets({ ...filters, cursor });
			if (key === filterKey) extra = { key, pages: [...extraPages, next] };
		} catch {
			loadMoreFailed = true;
		} finally {
			loadingMore = false;
		}
	}

	function autoLoad(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && !loadMoreFailed) void loadMore();
			},
			{ rootMargin: '800px 0px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	}

	function update(patch: Partial<TweetFilters>, replace = false) {
		const query = filtersToParams({ ...filters, ...patch }).toString();
		// The pathname form: route IDs with a query keep the `(app)` group in SvelteKit 3.2.
		return goto(query ? resolve(`?${query}`) : resolve('/(app)'), { reset: false, replace });
	}

	let searchDraft = $state<string | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function search(value: string) {
		searchDraft = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			await update({ q: value }, true);
			if (searchDraft === value) searchDraft = null;
		}, 300);
	}

	function accountLabel(account: (typeof accounts)[number]) {
		const former = account.usernames.filter((name) => name !== account.username);
		const formerText = former.length > 0 ? ` (formerly @${former.join(', @')})` : '';
		return `@${account.username}${formerText} · ${formatNumber(account.tweets)}`;
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-3">
		<InputGroup.Root>
			<InputGroup.Addon>
				<SearchIcon aria-hidden="true" />
			</InputGroup.Addon>
			<InputGroup.Input
				type="search"
				placeholder="Search tweets"
				aria-label="Search tweets"
				bind:value={() => searchDraft ?? filters.q, search}
			/>
		</InputGroup.Root>

		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			aria-label="Tweet type"
			bind:value={
				() => filters.kind,
				(value) => {
					if (value) void update({ kind: value as TweetFilters['kind'] });
				}
			}
		>
			{#each KIND_FILTERS as kind (kind)}
				<ToggleGroup.Item value={kind}>{KIND_LABELS[kind]}</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>

		<div class="flex flex-wrap items-center gap-2">
			<NativeSelect.Root
				size="sm"
				class="max-w-full min-w-0"
				aria-label="Account"
				value={filters.account}
				onchange={(event) => update({ account: event.currentTarget.value })}
			>
				<NativeSelect.Option value="">All accounts</NativeSelect.Option>
				{#each accounts as account (account.id)}
					<NativeSelect.Option value={account.id}>{accountLabel(account)}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>

			<NativeSelect.Root
				size="sm"
				aria-label="Deleted tweets"
				value={filters.deleted}
				onchange={(event) =>
					update({ deleted: event.currentTarget.value as TweetFilters['deleted'] })}
			>
				<NativeSelect.Option value="include">Include deleted</NativeSelect.Option>
				<NativeSelect.Option value="only">Only deleted</NativeSelect.Option>
				<NativeSelect.Option value="exclude">Hide deleted</NativeSelect.Option>
			</NativeSelect.Root>

			<NativeSelect.Root
				size="sm"
				aria-label="Sort order"
				value={filters.sort}
				onchange={(event) => update({ sort: event.currentTarget.value as TweetFilters['sort'] })}
			>
				<NativeSelect.Option value="newest">Newest first</NativeSelect.Option>
				<NativeSelect.Option value="oldest">Oldest first</NativeSelect.Option>
			</NativeSelect.Root>

			<Input
				type="month"
				class="h-7 w-auto"
				aria-label={filters.sort === 'newest'
					? 'Show tweets up to month'
					: 'Show tweets from month'}
				title={filters.sort === 'newest'
					? 'Show tweets up to this month'
					: 'Show tweets from this month'}
				value={filters.month}
				onchange={(event) => update({ month: event.currentTarget.value })}
			/>

			<div class="flex items-center gap-2">
				<Switch
					id="with-media"
					size="sm"
					bind:checked={() => filters.media, (media) => void update({ media })}
				/>
				<Label for="with-media" class="text-sm font-normal">With media</Label>
			</div>
		</div>
	</div>

	<div class="flex min-h-7 items-center justify-between gap-2 text-sm text-muted-foreground">
		<p aria-live="polite" class="flex items-center gap-2">
			{formatNumber(total)}
			{total === 1 ? 'tweet' : 'tweets'}
			{#if $effect.pending()}
				<Spinner class="size-3.5" aria-label="Updating" />
			{/if}
		</p>
		{#if hasFilters}
			<Button variant="ghost" size="sm" onclick={() => update(DEFAULT_FILTERS)}>
				Clear filters
			</Button>
		{/if}
	</div>

	{#if items.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				{#if stats.tweets === 0}
					<Empty.Title>No tweets yet</Empty.Title>
					<Empty.Description>
						Import a Twitter archive or a my-tweets export to fill your archive.
					</Empty.Description>
				{:else}
					<Empty.Title>No matching tweets</Empty.Title>
					<Empty.Description>Try a different search or clear the filters.</Empty.Description>
				{/if}
			</Empty.Header>
			<Empty.Content>
				{#if stats.tweets === 0}
					<Button href={resolve('/(app)/import')}>Import data</Button>
				{:else}
					<Button variant="outline" onclick={() => update(DEFAULT_FILTERS)}>Clear filters</Button>
				{/if}
			</Empty.Content>
		</Empty.Root>
	{:else}
		<div class="-mx-4 border-t sm:mx-0 sm:rounded-lg sm:border">
			{#each items as tweet (tweet.id)}
				<TweetCard {tweet} />
			{/each}
		</div>

		{#if nextCursor}
			<div class="flex flex-col items-center gap-2" {@attach autoLoad}>
				{#if loadMoreFailed}
					<p class="text-sm text-destructive">More tweets could not be loaded.</p>
				{/if}
				<Button variant="outline" onclick={loadMore} disabled={loadingMore}>
					{#if loadingMore}<Spinner aria-hidden="true" />{/if}
					{loadMoreFailed ? 'Try again' : 'Load more'}
				</Button>
			</div>
		{:else}
			<p class="text-center text-sm text-muted-foreground">End of the archive.</p>
		{/if}
	{/if}
</div>
