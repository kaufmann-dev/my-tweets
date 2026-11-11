<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import SearchIcon from '@lucide/svelte/icons/search';
	import TimelineScrubber from '#lib/components/timeline-scrubber.svelte';
	import TweetCard from '#lib/components/tweet-card.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { formatNumber } from '#lib/format.ts';
	import {
		DEFAULT_FILTERS,
		filtersFromParams,
		filtersToParams,
		KIND_FILTERS,
		SORTS,
		type TweetFilters
	} from '#lib/tweet-filters.ts';
	import { monthOffsets, orderMonths } from '#lib/timeline-scrubber.ts';
	import type { AccountOption, TweetMonth, TweetPage } from '#lib/tweet-types.ts';
	import { getAccounts, getTweetMonths, listTweets } from './data.remote';

	const KIND_LABELS: Record<TweetFilters['kind'], string> = {
		all: 'All',
		tweet: 'Tweets',
		reply: 'Replies',
		retweet: 'Retweets',
		quote: 'Quotes'
	};

	const SORT_LABELS: Record<TweetFilters['sort'], string> = {
		newest: 'Newest first',
		oldest: 'Oldest first',
		likes: 'Most liked',
		retweets: 'Most retweeted'
	};

	// Date ranges are whole days in the viewer's time zone.
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const filters = $derived(filtersFromParams(page.url.searchParams));
	const hasFilters = $derived(filtersToParams(filters).toString() !== '');

	/** Height of the sticky header; the tweet just below it is the current scroll position. */
	const HEADER_HEIGHT = 56;

	interface TimelineView {
		filters: TweetFilters;
		/** Months in display order, with the number of tweets shown before each. */
		months: TweetMonth[];
		offsets: number[];
		total: number;
		pages: TweetPage[];
		/** Tweets that come before the first loaded one, after a jump into the middle. */
		offset: number;
	}

	// Results are loaded per navigation instead of with `await` in a `$derived`: with Svelte 5.57,
	// a filter change that arrives while the previous one is still loading sends the async batch
	// scheduler into an endless loop that freezes the tab.
	let view = $state.raw<TimelineView | null>(null);
	let accounts = $state.raw<AccountOption[]>([]);
	let loading = $state(true);
	let loadFailed = $state(false);
	let latestLoad = 0;

	async function load() {
		const current = ++latestLoad;
		const requested = filters;
		loading = true;
		loadFailed = false;
		try {
			const [first, monthList, accountList] = await Promise.all([
				listTweets({ ...requested, timeZone, cursor: null }),
				getTweetMonths({ ...requested, timeZone }),
				getAccounts()
			]);
			if (current !== latestLoad) return;
			const months = orderMonths(monthList, requested.sort);
			view = {
				filters: requested,
				months,
				offsets: monthOffsets(months),
				total: months.reduce((sum, month) => sum + month.total, 0),
				pages: [first],
				offset: 0
			};
			accounts = accountList;
			await tick();
			trackPosition();
		} catch {
			if (current === latestLoad) loadFailed = true;
		} finally {
			if (current === latestLoad) loading = false;
		}
	}

	// Runs on mount and after every filter change, including back and forward.
	afterNavigate(() => void load());

	const items = $derived(view?.pages.flatMap((result) => result.items) ?? []);
	const nextCursor = $derived(view?.pages.at(-1)?.nextCursor ?? null);
	const previousCursor = $derived(
		view && view.offset > 0 ? (view.pages[0]?.previousCursor ?? null) : null
	);
	const showScrubber = $derived(
		view !== null &&
			(view.filters.sort === 'newest' || view.filters.sort === 'oldest') &&
			view.months.length >= 2
	);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	let loadingPrevious = $state(false);
	let loadPreviousFailed = $state(false);

	async function loadMore() {
		const base = view;
		if (!base || !nextCursor || loadingMore) return;
		loadingMore = true;
		loadMoreFailed = false;
		try {
			const next = await listTweets({ ...base.filters, timeZone, cursor: nextCursor });
			// Ignore the page when the filters changed while it was loading.
			if (view === base) view = { ...base, pages: [...base.pages, next] };
		} catch {
			loadMoreFailed = true;
		} finally {
			loadingMore = false;
		}
	}

	async function loadPrevious() {
		const base = view;
		if (!base || !previousCursor || loadingPrevious) return;
		loadingPrevious = true;
		loadPreviousFailed = false;
		try {
			const previous = await listTweets({
				...base.filters,
				timeZone,
				cursor: previousCursor,
				direction: 'previous'
			});
			if (view !== base) return;
			// Keep the tweets on screen in place while the new ones are added above them.
			const anchor = list?.firstElementChild;
			const before = anchor?.getBoundingClientRect().top ?? 0;
			view = {
				...base,
				pages: [previous, ...base.pages],
				offset: Math.max(base.offset - previous.items.length, 0)
			};
			await tick();
			if (anchor?.isConnected) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
			trackPosition();
		} catch {
			loadPreviousFailed = true;
		} finally {
			loadingPrevious = false;
		}
	}

	async function jump(index: number) {
		const base = view;
		const month = base?.months[index];
		if (!base || !month) return;
		const current = ++latestLoad;
		loading = true;
		loadFailed = false;
		try {
			// The first month starts at the top; others start at their first tweet in display order.
			const at = index === 0 ? null : base.filters.sort === 'newest' ? month.end : month.start;
			const page = await listTweets({ ...base.filters, timeZone, cursor: null, at });
			if (current !== latestLoad) return;
			view = { ...base, pages: [page], offset: index === 0 ? 0 : (base.offsets[index] ?? 0) };
			loadMoreFailed = false;
			loadPreviousFailed = false;
			await tick();
			list?.scrollIntoView({ block: 'start' });
			trackPosition();
		} catch {
			if (current === latestLoad) loadFailed = true;
		} finally {
			if (current === latestLoad) loading = false;
		}
	}

	function autoLoad(onVisible: () => void) {
		return (node: HTMLElement) => {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) onVisible();
				},
				{ rootMargin: '800px 0px' }
			);
			observer.observe(node);
			return () => observer.disconnect();
		};
	}

	let list = $state<HTMLElement>();
	/** Share of the timeline above the top of the viewport, 0–1. */
	let position = $state(0);
	let positionFrame = 0;

	function trackPosition() {
		const cards = list?.children;
		if (!view || !cards || cards.length === 0 || view.total === 0) return;
		// The first card that reaches below the header.
		let low = 0;
		let high = cards.length - 1;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (cards[middle]!.getBoundingClientRect().bottom > HEADER_HEIGHT) high = middle;
			else low = middle + 1;
		}
		const rect = cards[low]!.getBoundingClientRect();
		const within = rect.height > 0 ? (HEADER_HEIGHT - rect.top) / rect.height : 0;
		const shown = view.offset + low + Math.min(Math.max(within, 0), 1);
		position = Math.min(Math.max(shown / view.total, 0), 1);
	}

	function schedulePosition() {
		cancelAnimationFrame(positionFrame);
		positionFrame = requestAnimationFrame(trackPosition);
	}

	let searchDraft = $state<string | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	async function update(patch: Partial<TweetFilters>, replace = false) {
		// A search still waiting for its debounce goes along with any other filter change.
		clearTimeout(searchTimer);
		const draft = searchDraft;
		const query = filtersToParams({
			...filters,
			...(draft === null ? {} : { q: draft }),
			...patch
		}).toString();
		// The pathname form: route IDs with a query keep the `(app)` group in SvelteKit 3.2.
		await goto(query ? resolve(`?${query}`) : resolve('/(app)'), { reset: false, replace });
		if (searchDraft === draft) searchDraft = null;
	}

	function search(value: string) {
		searchDraft = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void update({}, true), 300);
	}

	function accountLabel(account: AccountOption) {
		const former = account.usernames.filter((name) => name !== account.username);
		const formerText = former.length > 0 ? ` (formerly @${former.join(', @')})` : '';
		return `@${account.username}${formerText} · ${formatNumber(account.tweets)}`;
	}
</script>

<svelte:window onscroll={schedulePosition} onresize={schedulePosition} />

{#if view && showScrubber}
	<TimelineScrubber
		months={view.months}
		offsets={view.offsets}
		total={view.total}
		{position}
		onjump={jump}
	/>
{/if}

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

		<div class="flex flex-wrap items-center gap-2">
			<ToggleGroup.Root
				type="single"
				spacing={0.5}
				size="sm"
				class="h-8 rounded-2xl bg-input/50 p-0.5"
				aria-label="Tweet type"
				bind:value={
					() => filters.kind,
					(value) => {
						if (value) void update({ kind: value as TweetFilters['kind'] });
					}
				}
			>
				{#each KIND_FILTERS as kind (kind)}
					<ToggleGroup.Item
						value={kind}
						class="px-3 data-[state=on]:bg-background dark:data-[state=on]:bg-input"
					>
						{KIND_LABELS[kind]}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>

			<NativeSelect.Root
				class="min-w-0 flex-1 basis-56"
				aria-label="Account"
				value={filters.account}
				onchange={(event) => update({ account: event.currentTarget.value })}
			>
				<NativeSelect.Option value="">All accounts</NativeSelect.Option>
				{#each accounts as account (account.id)}
					<NativeSelect.Option value={account.id}>{accountLabel(account)}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<div class="flex items-center gap-1.5">
				<Input
					type="date"
					class="w-auto"
					aria-label="From date"
					title="From date"
					max={filters.to || undefined}
					value={filters.from}
					onchange={(event) => update({ from: event.currentTarget.value })}
				/>
				<span class="text-sm text-muted-foreground" aria-hidden="true">–</span>
				<Input
					type="date"
					class="w-auto"
					aria-label="To date"
					title="To date"
					min={filters.from || undefined}
					value={filters.to}
					onchange={(event) => update({ to: event.currentTarget.value })}
				/>
			</div>

			<NativeSelect.Root
				aria-label="Sort order"
				value={filters.sort}
				onchange={(event) => update({ sort: event.currentTarget.value as TweetFilters['sort'] })}
			>
				{#each SORTS as sort (sort)}
					<NativeSelect.Option value={sort}>{SORT_LABELS[sort]}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>

			<div class="flex h-8 items-center gap-2 px-1">
				<Switch
					id="with-media"
					bind:checked={() => filters.media, (media) => void update({ media })}
				/>
				<Label for="with-media" class="text-sm font-normal">With media</Label>
			</div>
		</div>
	</div>

	<div class="flex min-h-7 items-center justify-between gap-2 text-sm text-muted-foreground">
		<p aria-live="polite" class="flex items-center gap-2">
			{#if view}
				{formatNumber(view.total)}
				{view.total === 1 ? 'tweet' : 'tweets'}
			{/if}
			{#if loading}
				<Spinner class="size-3.5" aria-label="Loading" />
			{/if}
		</p>
		{#if hasFilters}
			<Button variant="ghost" size="sm" onclick={() => update(DEFAULT_FILTERS)}>
				Clear filters
			</Button>
		{/if}
	</div>

	{#if loadFailed}
		<Alert.Root variant="destructive">
			<Alert.Title>Tweets could not be loaded</Alert.Title>
			<Alert.Description>
				<p>Check your connection and try again.</p>
				<Button variant="outline" size="sm" class="mt-2" onclick={load}>Try again</Button>
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !view}
		{#if loading}
			<div class="flex flex-col gap-3" aria-hidden="true">
				<Skeleton class="h-28 w-full" />
				<Skeleton class="h-28 w-full" />
				<Skeleton class="h-28 w-full" />
			</div>
		{/if}
	{:else if items.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				{#if hasFilters}
					<Empty.Title>No matching tweets</Empty.Title>
					<Empty.Description>Try a different search or clear the filters.</Empty.Description>
				{:else}
					<Empty.Title>No tweets yet</Empty.Title>
					<Empty.Description>
						Import a Twitter archive or a my-tweets export to fill your archive.
					</Empty.Description>
				{/if}
			</Empty.Header>
			<Empty.Content>
				{#if hasFilters}
					<Button variant="outline" onclick={() => update(DEFAULT_FILTERS)}>Clear filters</Button>
				{:else}
					<Button href={resolve('/(app)/import')}>Import data</Button>
				{/if}
			</Empty.Content>
		</Empty.Root>
	{:else}
		{#if previousCursor}
			<div
				class="flex flex-col items-center gap-2"
				{@attach autoLoad(() => {
					if (!loadPreviousFailed) void loadPrevious();
				})}
			>
				{#if loadPreviousFailed}
					<p class="text-sm text-destructive">The tweets above could not be loaded.</p>
				{/if}
				<Button variant="outline" onclick={loadPrevious} disabled={loadingPrevious}>
					{#if loadingPrevious}<Spinner aria-hidden="true" />{/if}
					{loadPreviousFailed
						? 'Try again'
						: view.filters.sort === 'oldest'
							? 'Load older'
							: 'Load newer'}
				</Button>
			</div>
		{/if}

		<div class="-mx-4 scroll-mt-14 border-t sm:mx-0 sm:rounded-lg sm:border" bind:this={list}>
			{#each items as tweet (tweet.id)}
				<TweetCard {tweet} />
			{/each}
		</div>

		{#if nextCursor}
			<div
				class="flex flex-col items-center gap-2"
				{@attach autoLoad(() => {
					if (!loadMoreFailed) void loadMore();
				})}
			>
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
