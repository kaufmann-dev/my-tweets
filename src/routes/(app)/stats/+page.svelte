<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BarChart, { type Bar } from '#lib/components/bar-chart.svelte';
	import TweetCard from '#lib/components/tweet-card.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { formatDay, formatMonth, formatNumber, lastDayOfMonth } from '#lib/format.ts';
	import { DEFAULT_FILTERS, filtersToParams, type TweetFilters } from '#lib/tweet-filters.ts';
	import type { AccountOption, NamedTotal, TweetStats } from '#lib/tweet-types.ts';
	import { getAccounts, getTweetStats } from '../data.remote';

	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const account = $derived(page.url.searchParams.get('account') ?? '');

	// Loaded per navigation, like the timeline; see the note there.
	let stats = $state.raw<TweetStats | null>(null);
	let accounts = $state.raw<AccountOption[]>([]);
	let loading = $state(true);
	let loadFailed = $state(false);
	let latestLoad = 0;

	async function load() {
		const current = ++latestLoad;
		loading = true;
		loadFailed = false;
		try {
			const [nextStats, accountList] = await Promise.all([
				getTweetStats({ account, timeZone }),
				getAccounts()
			]);
			if (current !== latestLoad) return;
			stats = nextStats;
			accounts = accountList;
		} catch {
			if (current === latestLoad) loadFailed = true;
		} finally {
			if (current === latestLoad) loading = false;
		}
	}

	afterNavigate(() => void load());

	function selectAccount(id: string) {
		return goto(resolve(id ? `stats?account=${encodeURIComponent(id)}` : '/(app)/stats'));
	}

	/** Link to the timeline with the stats page's account plus the given filters. */
	function timeline(patch: Partial<TweetFilters>) {
		const query = filtersToParams({ ...DEFAULT_FILTERS, account, ...patch }).toString();
		return query ? resolve(`?${query}`) : resolve('/(app)');
	}

	function tweetCount(total: number) {
		return `${formatNumber(total)} ${total === 1 ? 'tweet' : 'tweets'}`;
	}

	const summary = $derived(
		stats
			? [
					{ label: 'Tweets', value: formatNumber(stats.tweets) },
					{ label: 'Original tweets', value: formatNumber(stats.originals) },
					{ label: 'Replies', value: formatNumber(stats.replies) },
					{ label: 'Retweets', value: formatNumber(stats.retweets) },
					{ label: 'With media', value: formatNumber(stats.withMedia) },
					{ label: 'Likes received', value: formatNumber(stats.likes) },
					{ label: 'Retweets received', value: formatNumber(stats.retweeted) },
					{ label: 'Days with tweets', value: formatNumber(stats.activeDays) },
					{
						label: 'Tweets per active day',
						value: stats.activeDays > 0 ? (stats.tweets / stats.activeDays).toFixed(1) : '0'
					}
				]
			: []
	);

	const monthBars = $derived<Bar[]>(
		(stats?.months ?? []).map(({ month, total }) => ({
			key: month,
			label: `${formatMonth(month)}: ${tweetCount(total)}`,
			value: total,
			tick: month.endsWith('-01') ? month.slice(0, 4) : undefined,
			href: timeline({ from: `${month}-01`, to: lastDayOfMonth(month) })
		}))
	);
	const hourBars = $derived<Bar[]>(
		(stats?.hours ?? []).map((total, hour) => ({
			key: String(hour),
			label: `${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59: ${tweetCount(total)}`,
			value: total,
			tick: hour % 6 === 0 ? String(hour).padStart(2, '0') : undefined
		}))
	);
	const weekdayBars = $derived<Bar[]>(
		(stats?.weekdays ?? []).map((total, index) => ({
			key: WEEKDAYS[index] ?? String(index),
			label: `${WEEKDAYS[index]}: ${tweetCount(total)}`,
			value: total,
			tick: WEEKDAYS[index]
		}))
	);
</script>

{#snippet ranking(rows: NamedTotal[], prefix: string)}
	{@const max = Math.max(1, ...rows.map((row) => row.total))}
	<ol class="flex flex-col gap-2 text-sm">
		{#each rows as row (row.name)}
			<li class="flex flex-col gap-1">
				<div class="flex items-baseline justify-between gap-3">
					<span class="truncate">{prefix}{row.name}</span>
					<span class="shrink-0 text-muted-foreground tabular-nums">{formatNumber(row.total)}</span>
				</div>
				<div class="h-1.5 rounded-full bg-muted" aria-hidden="true">
					<div
						class="h-full rounded-full bg-primary/70"
						style:width={`${(row.total / max) * 100}%`}
					></div>
				</div>
			</li>
		{/each}
	</ol>
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex items-center gap-2">
		<NativeSelect.Root
			class="min-w-0 flex-1"
			aria-label="Account"
			value={account}
			onchange={(event) => selectAccount(event.currentTarget.value)}
		>
			<NativeSelect.Option value="">All accounts</NativeSelect.Option>
			{#each accounts as option (option.id)}
				<NativeSelect.Option value={option.id}>
					@{option.username} · {formatNumber(option.tweets)}
				</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
		{#if loading}<Spinner class="size-4 shrink-0" aria-label="Loading" />{/if}
	</div>

	{#if loadFailed}
		<Alert.Root variant="destructive">
			<Alert.Title>Stats could not be loaded</Alert.Title>
			<Alert.Description>
				<p>Check your connection and try again.</p>
				<Button variant="outline" size="sm" class="mt-2" onclick={load}>Try again</Button>
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !stats}
		{#if loading}
			<div class="flex flex-col gap-3" aria-hidden="true">
				<Skeleton class="h-40 w-full" />
				<Skeleton class="h-48 w-full" />
				<Skeleton class="h-48 w-full" />
			</div>
		{/if}
	{:else if stats.tweets === 0}
		<p class="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
			No tweets to count yet.
		</p>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Overview</Card.Title>
				{#if stats.months.length > 0}
					<Card.Description>
						{formatMonth(stats.months[0]?.month ?? '')} – {formatMonth(
							stats.months.at(-1)?.month ?? ''
						)}
					</Card.Description>
				{/if}
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
					{#each summary as item (item.label)}
						<div>
							<dt class="text-muted-foreground">{item.label}</dt>
							<dd class="text-lg font-medium tabular-nums">{item.value}</dd>
						</div>
					{/each}
					{#if stats.busiestDay}
						<div class="col-span-2 sm:col-span-3">
							<dt class="text-muted-foreground">Busiest day</dt>
							<dd class="font-medium">
								<a
									class="hover:underline"
									href={timeline({ from: stats.busiestDay.day, to: stats.busiestDay.day })}
								>
									{formatDay(stats.busiestDay.day)} · {tweetCount(stats.busiestDay.total)}
								</a>
							</dd>
						</div>
					{/if}
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tweets per month</Card.Title>
				<Card.Description>Select a month to open its tweets.</Card.Description>
			</Card.Header>
			<Card.Content>
				<BarChart bars={monthBars} label="Tweets per month" />
			</Card.Content>
		</Card.Root>

		<div class="grid gap-4 sm:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>Time of day</Card.Title>
					<Card.Description>Hours in your time zone.</Card.Description>
				</Card.Header>
				<Card.Content>
					<BarChart bars={hourBars} label="Tweets per hour of day" />
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Title>Day of week</Card.Title>
				</Card.Header>
				<Card.Content>
					<BarChart bars={weekdayBars} label="Tweets per day of week" />
				</Card.Content>
			</Card.Root>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			{#if stats.repliedTo.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Most replied to</Card.Title>
					</Card.Header>
					<Card.Content>
						{@render ranking(stats.repliedTo, '@')}
					</Card.Content>
				</Card.Root>
			{/if}
			{#if stats.clients.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Posted from</Card.Title>
					</Card.Header>
					<Card.Content>
						{@render ranking(stats.clients, '')}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		{#if stats.topLiked.length > 0}
			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between gap-2">
					<h2 class="font-medium">Most liked</h2>
					<Button variant="ghost" size="sm" href={timeline({ sort: 'likes' })}>See all</Button>
				</div>
				<div class="-mx-4 border-t sm:mx-0 sm:rounded-lg sm:border">
					{#each stats.topLiked as tweet (tweet.id)}
						<TweetCard {tweet} />
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>
