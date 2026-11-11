<script lang="ts">
	import Heart from '@lucide/svelte/icons/heart';
	import Repeat2 from '@lucide/svelte/icons/repeat-2';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { formatDateTime, formatNumber, tweetUrl } from '#lib/format.ts';
	import { linkify } from '#lib/linkify.ts';
	import type { TweetView } from '#lib/tweet-types.ts';

	let { tweet }: { tweet: TweetView } = $props();

	const segments = $derived(linkify(tweet.text));
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

	const kindLabel = $derived(
		tweet.kind === 'reply' ? 'Reply' : tweet.kind === 'retweet' ? 'Retweet' : null
	);
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

	{#if kindLabel || tweet.quote || tweet.community}
		<div class="flex flex-wrap items-center gap-1.5">
			{#if kindLabel}<Badge variant="secondary">{kindLabel}</Badge>{/if}
			{#if tweet.quote}<Badge variant="secondary">Quote</Badge>{/if}
			{#if tweet.community}<Badge variant="outline">Community</Badge>{/if}
		</div>
	{/if}

	{#if tweet.kind === 'reply' && tweet.inReplyToScreenName}
		<p class="text-sm text-muted-foreground">
			Replying to
			<a
				class="hover:underline"
				href={tweet.inReplyToStatusId
					? tweetUrl(tweet.inReplyToStatusId)
					: `https://x.com/${tweet.inReplyToScreenName}`}
				target="_blank"
				rel="external noopener noreferrer">@{tweet.inReplyToScreenName}</a
			>
		</p>
	{/if}

	{#if tweet.text}
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
		<div class={['grid gap-1.5', tweet.media.length > 1 && 'grid-cols-2']}>
			{#each tweet.media as media (media.key)}
				{#if missing.includes(media.key)}
					<p
						class="flex min-h-16 items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm text-muted-foreground"
					>
						{media.isVideo ? 'Video' : 'Photo'} not in the archive and deleted from X
					</p>
				{:else if media.isVideo}
					<video
						class="max-h-[32rem] w-full rounded-lg border bg-muted"
						controls
						preload="metadata"
						playsinline
						onerror={(event) => {
							if (event.currentTarget.hasAttribute('src')) missing = [...missing, media.key];
						}}
						{@attach lazyVideo(media.src)}
					></video>
				{:else}
					<a href={media.src} target="_blank" rel="external noopener noreferrer" class="block">
						<img
							class="max-h-[32rem] w-full rounded-lg border bg-muted object-cover"
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
