<script lang="ts">
	import Heart from '@lucide/svelte/icons/heart';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Quote from '@lucide/svelte/icons/quote';
	import Repeat2 from '@lucide/svelte/icons/repeat-2';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { formatDateTime, formatNumber } from '#lib/format.ts';
	import { linkify } from '#lib/linkify.ts';
	import { presentTweet, type TweetContext } from '#lib/tweet-text.ts';
	import type { TweetView } from '#lib/tweet-types.ts';

	let { tweet }: { tweet: TweetView } = $props();

	const CONTEXT = {
		reply: { icon: MessageCircle, label: 'Reply to', bare: 'Reply' },
		retweet: { icon: Repeat2, label: 'Retweet of', bare: 'Retweet' },
		quote: { icon: Quote, label: 'Quote of', bare: 'Quote' }
	} satisfies Record<TweetContext['type'], unknown>;

	const presented = $derived(presentTweet(tweet));
	const many = $derived(tweet.media.length > 1);
	const segments = $derived(linkify(presented.text));

	// Media that only exists on X's servers disappears when the tweet is deleted there.
	let missing = $state.raw<string[]>([]);

	/**
	 * Loads a video only while it is near the viewport. Browsers cap the number of live media
	 * players per page, which a long timeline of preloaded videos would exceed.
	 */
	function lazyVideo(src: string) {
		return (node: HTMLVideoElement) => {
			const observer = new IntersectionObserver(
				(entries) => {
					const visible = entries.some((entry) => entry.isIntersecting);
					if (visible && !node.hasAttribute('src')) {
						// Seeking to 0.1 s shows the first frame as the preview.
						node.src = `${src}#t=0.1`;
					} else if (!visible && node.hasAttribute('src') && node.paused) {
						node.removeAttribute('src');
						node.load();
					}
				},
				{ rootMargin: '1500px 0px' }
			);
			observer.observe(node);
			return () => observer.disconnect();
		};
	}
</script>

<article class="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0">
	<header class="flex min-w-0 items-start justify-between gap-3">
		<div class="flex min-w-0 flex-col">
			<span class="truncate font-medium">{tweet.displayName}</span>
			<span class="truncate text-sm text-muted-foreground">@{tweet.username}</span>
		</div>
		<time datetime={tweet.createdAt} class="shrink-0 text-sm text-muted-foreground">
			{formatDateTime(tweet.createdAt)}
		</time>
	</header>

	{#if presented.contexts.length > 0 || tweet.community}
		<div class="flex flex-col gap-1 text-sm text-muted-foreground">
			{#each presented.contexts as context (context.type)}
				{@const Icon = CONTEXT[context.type].icon}
				<p class="flex min-w-0 items-start gap-1.5">
					<Icon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<span class="min-w-0 break-words">
						{context.targets.length > 0 ? CONTEXT[context.type].label : CONTEXT[context.type].bare}
						{#each context.targets as target (target.username)}
							<a
								class="ml-1 text-foreground hover:underline"
								href={target.href}
								target="_blank"
								rel="external noopener noreferrer">@{target.username}</a
							>
						{/each}
					</span>
				</p>
			{/each}
			{#if tweet.community}<Badge variant="outline" class="self-start">Community</Badge>{/if}
		</div>
	{/if}

	{#if presented.text}
		<p class="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
			{#each segments as segment, index (index)}
				{#if segment.type === 'link'}
					<a
						href={segment.href}
						target="_blank"
						rel="external noopener noreferrer"
						class="text-sky-700 hover:underline dark:text-sky-400">{segment.value}</a
					>
				{:else}
					{segment.value}
				{/if}
			{/each}
		</p>
	{/if}

	{#if tweet.media.length > 0}
		<!-- Several items share one fixed frame, like on X, instead of rows of uneven heights. -->
		<div
			class={[
				'grid gap-1',
				many && 'aspect-[16/10] grid-cols-2 overflow-hidden rounded-lg',
				tweet.media.length > 2 && 'grid-rows-2'
			]}
		>
			{#each tweet.media as media, index (media.key)}
				{@const tile = ['min-h-0 min-w-0', tweet.media.length === 3 && index === 0 && 'row-span-2']}
				{@const fit = many
					? 'h-full w-full border bg-muted object-cover'
					: 'max-h-[32rem] w-full rounded-lg border bg-muted object-cover'}
				{#if missing.includes(media.key)}
					<p
						class={[
							tile,
							'flex min-h-16 items-center justify-center border border-dashed px-3 text-center text-sm text-muted-foreground',
							!many && 'rounded-lg'
						]}
					>
						{media.isVideo ? 'Video' : 'Photo'} not in the archive and deleted from X
					</p>
				{:else if media.isVideo}
					<video
						class={[tile, fit]}
						controls
						preload="metadata"
						playsinline
						onerror={(event) => {
							if (event.currentTarget.hasAttribute('src')) missing = [...missing, media.key];
						}}
						{@attach lazyVideo(media.src)}
					></video>
				{:else}
					<a
						href={media.src}
						target="_blank"
						rel="external noopener noreferrer"
						class={[tile, 'block']}
					>
						<img
							class={fit}
							src={media.src}
							alt=""
							loading="lazy"
							referrerpolicy={media.local ? undefined : 'no-referrer'}
							onerror={() => (missing = [...missing, media.key])}
						/>
					</a>
				{/if}
			{/each}
		</div>
	{/if}

	<footer class="flex items-center gap-4 text-sm text-muted-foreground">
		<span class="flex items-center gap-1" title="Likes">
			<Heart class="size-4" aria-hidden="true" />
			<span class="sr-only">Likes:</span>
			{formatNumber(tweet.favoriteCount)}
		</span>
		<span class="flex items-center gap-1" title="Retweets">
			<Repeat2 class="size-4" aria-hidden="true" />
			<span class="sr-only">Retweets:</span>
			{formatNumber(tweet.retweetCount)}
		</span>
		{#if tweet.source}<span class="truncate">{tweet.source}</span>{/if}
	</footer>
</article>
