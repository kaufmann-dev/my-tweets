<script lang="ts">
	export interface Bar {
		key: string;
		/** Read by screen readers and shown as the tooltip, e.g. "Mar 2021: 412 tweets". */
		label: string;
		value: number;
		/** Axis label below the bar; leave empty for bars without one. */
		tick?: string;
		href?: string;
	}

	let { bars, label }: { bars: Bar[]; label: string } = $props();

	const max = $derived(Math.max(1, ...bars.map((bar) => bar.value)));
</script>

<div>
	<ol class="flex h-32 items-end gap-px" aria-label={label}>
		{#each bars as bar (bar.key)}
			<li class="flex h-full min-w-0 flex-1 items-end" title={bar.label}>
				<svelte:element
					this={bar.href ? 'a' : 'div'}
					href={bar.href}
					class="block w-full rounded-t-xs bg-primary/70 hover:bg-primary"
					style:height={`${(bar.value / max) * 100}%`}
					style:min-height={bar.value > 0 ? '2px' : '0'}
				>
					<span class="sr-only">{bar.label}</span>
				</svelte:element>
			</li>
		{/each}
	</ol>
	<div class="mt-1 flex gap-px border-t pt-1 text-xs text-muted-foreground" aria-hidden="true">
		{#each bars as bar (bar.key)}
			<span class="h-4 min-w-0 flex-1 whitespace-nowrap">{bar.tick ?? ''}</span>
		{/each}
	</div>
</div>
