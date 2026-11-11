<script lang="ts">
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import { formatMonthLong } from '#lib/format.ts';
	import { monthAtFraction, scrubberMarks, type ScrubberMonth } from '#lib/timeline-scrubber.ts';

	let {
		months,
		offsets,
		total,
		position,
		onjump
	}: {
		/** Months in display order. */
		months: ScrubberMonth[];
		/** Tweets shown before each month. */
		offsets: number[];
		total: number;
		/** Share of the timeline above the viewport, 0–1. */
		position: number;
		onjump: (index: number) => void;
	} = $props();

	let track = $state<HTMLElement>();
	let height = $state(0);
	/** Where a drag or key press points before it jumps there. */
	let preview = $state<{ fraction: number; index: number } | null>(null);
	let hover = $state<{ fraction: number; index: number } | null>(null);
	let dragging = false;
	let keyTimer: ReturnType<typeof setTimeout> | undefined;

	const marks = $derived(scrubberMarks(months, offsets, total, height));
	const currentIndex = $derived(monthAtFraction(months, offsets, total, position));
	const lineFraction = $derived(preview?.fraction ?? position);
	const label = $derived(preview ?? hover);

	function pointAt(clientY: number) {
		const rect = track?.getBoundingClientRect();
		if (!rect || rect.height === 0) return null;
		const fraction = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
		return { fraction, index: monthAtFraction(months, offsets, total, fraction) };
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.target as Element).setPointerCapture(event.pointerId);
		dragging = true;
		hover = null;
		preview = pointAt(event.clientY);
	}

	function onpointermove(event: PointerEvent) {
		if (dragging) preview = pointAt(event.clientY);
		else if (event.pointerType === 'mouse') hover = pointAt(event.clientY);
	}

	function onpointerup() {
		if (!dragging) return;
		dragging = false;
		if (preview) onjump(preview.index);
		preview = null;
	}

	function onpointercancel() {
		dragging = false;
		preview = null;
	}

	const KEY_STEPS: Record<string, (index: number) => number> = {
		ArrowDown: (index) => index + 1,
		ArrowUp: (index) => index - 1,
		PageDown: (index) => index + 12,
		PageUp: (index) => index - 12,
		Home: () => 0,
		End: () => months.length - 1
	};

	function onkeydown(event: KeyboardEvent) {
		const step = KEY_STEPS[event.key];
		if (!step) return;
		event.preventDefault();
		const index = Math.min(Math.max(step(preview?.index ?? currentIndex), 0), months.length - 1);
		preview = { fraction: (offsets[index] ?? 0) / total, index };
		clearTimeout(keyTimer);
		keyTimer = setTimeout(() => {
			preview = null;
			onjump(index);
		}, 300);
	}
</script>

<!-- Wide screens get the whole rail; narrow ones only a handle, so the rail does not cover the tweets. -->
<div
	class="pointer-events-none fixed top-14 right-0 bottom-0 z-10 w-12 touch-none outline-none select-none md:pointer-events-auto"
	role="slider"
	tabindex="0"
	aria-label="Jump to month"
	aria-orientation="vertical"
	aria-valuemin={0}
	aria-valuemax={months.length - 1}
	aria-valuenow={preview?.index ?? currentIndex}
	aria-valuetext={formatMonthLong(months[preview?.index ?? currentIndex]?.month ?? '')}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onpointercancel}
	onpointerleave={() => (hover = null)}
	{onkeydown}
	onblur={() => {
		clearTimeout(keyTimer);
		preview = null;
	}}
>
	<div
		class="absolute inset-x-0 top-4 bottom-4 rounded-md in-focus-visible:ring-[3px] in-focus-visible:ring-ring/50"
		bind:this={track}
		bind:clientHeight={height}
	>
		<div class="hidden md:block" aria-hidden="true">
			{#each marks as mark (mark.index)}
				{#if mark.kind === 'year'}
					<span
						class="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
						style:top="{mark.y}px"
					>
						{mark.label}
					</span>
				{:else}
					<span
						class="absolute right-4 size-1 -translate-y-1/2 rounded-full bg-muted-foreground/40"
						style:top="{mark.y}px"
					></span>
				{/if}
			{/each}
		</div>

		{#if hover && !preview}
			<div
				class="pointer-events-none absolute right-0 hidden h-px w-12 bg-muted-foreground/60 md:block"
				style:top="{hover.fraction * height}px"
				aria-hidden="true"
			></div>
		{/if}

		<div
			class="pointer-events-none absolute right-0 hidden h-0.5 w-12 -translate-y-1/2 bg-primary md:block"
			style:top="{lineFraction * height}px"
			aria-hidden="true"
		></div>

		<div
			class="pointer-events-auto absolute right-0 flex h-10 w-7 -translate-y-1/2 items-center justify-center rounded-l-full border border-r-0 bg-secondary text-secondary-foreground shadow-sm md:hidden"
			style:top="{lineFraction * height}px"
			aria-hidden="true"
		>
			<ChevronsUpDown class="size-3.5" />
		</div>

		{#if label}
			<div
				class="pointer-events-none absolute right-9 -translate-y-1/2 rounded-md border bg-popover px-2 py-1 text-sm whitespace-nowrap text-popover-foreground shadow-sm md:right-12"
				style:top="{label.fraction * height}px"
				aria-hidden="true"
			>
				{formatMonthLong(months[label.index]?.month ?? '')}
			</div>
		{/if}
	</div>
</div>
