<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formatBytes, formatDateTime, formatNumber } from '#lib/format.ts';
	import { getArchiveStats } from '../data.remote';

	const stats = $derived(await getArchiveStats());
</script>

<div class="flex flex-col gap-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>Export</Card.Title>
			<Card.Description>
				Download your whole archive for safekeeping. The full export can be imported again here to
				restore everything.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
				<div>
					<dt class="text-muted-foreground">Tweets</dt>
					<dd class="font-medium tabular-nums">{formatNumber(stats.tweets)}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Deleted on X</dt>
					<dd class="font-medium tabular-nums">{formatNumber(stats.deleted)}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Accounts</dt>
					<dd class="font-medium tabular-nums">{formatNumber(stats.accounts)}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Media files</dt>
					<dd class="font-medium tabular-nums">
						{formatNumber(stats.mediaFiles)} · {formatBytes(stats.mediaBytes)}
					</dd>
				</div>
				{#if stats.first && stats.last}
					<div class="col-span-2">
						<dt class="text-muted-foreground">Time span</dt>
						<dd class="font-medium">
							{formatDateTime(stats.first)} – {formatDateTime(stats.last)}
						</dd>
					</div>
				{/if}
			</dl>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-4 sm:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Full archive</Card.Title>
				<Card.Description>
					One zip with all tweets and every media file (about {formatBytes(stats.mediaBytes)}). Use
					this as your backup.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button href="/api/export/archive.zip" download data-sveltekit-reload>
					<Download aria-hidden="true" />
					Download zip
				</Button>
			</Card.Footer>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>Tweets only</Card.Title>
				<Card.Description>
					One JSON file with every tweet and account, without media files. Not importable.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button href="/api/export/tweets.json" variant="outline" download data-sveltekit-reload>
					<Download aria-hidden="true" />
					Download JSON
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
</div>
