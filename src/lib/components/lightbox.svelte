<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		images,
		index = $bindable(),
		onclose
	}: { images: string[]; index: number; onclose: () => void } = $props();

	const several = $derived(images.length > 1);

	function step(offset: number) {
		index = (index + offset + images.length) % images.length;
	}

	// The native modal dialog provides the focus trap, Escape and the backdrop.
	function modal(node: HTMLDialogElement) {
		node.showModal();
		return () => node.close();
	}
</script>

<dialog
	class="m-0 h-dvh max-h-none w-screen max-w-none bg-black/85 p-4 backdrop:bg-transparent"
	aria-label="Photo"
	{onclose}
	onclick={(event) => {
		if (!(event.target instanceof Element) || !event.target.closest('img, button')) onclose();
	}}
	onkeydown={(event) => {
		if (!several) return;
		if (event.key === 'ArrowLeft') step(-1);
		if (event.key === 'ArrowRight') step(1);
	}}
	{@attach modal}
>
	<div class="flex h-full w-full items-center justify-center">
		<img class="max-h-full max-w-full rounded-lg object-contain" src={images[index]} alt="" />
	</div>
	<Button
		variant="secondary"
		size="icon"
		class="fixed top-4 right-4"
		onclick={onclose}
		title="Close"
	>
		<X aria-hidden="true" />
		<span class="sr-only">Close</span>
	</Button>
	{#if several}
		<Button
			variant="secondary"
			size="icon"
			class="fixed top-1/2 left-4 -translate-y-1/2"
			onclick={() => step(-1)}
			title="Previous photo"
		>
			<ChevronLeft aria-hidden="true" />
			<span class="sr-only">Previous photo</span>
		</Button>
		<Button
			variant="secondary"
			size="icon"
			class="fixed top-1/2 right-4 -translate-y-1/2"
			onclick={() => step(1)}
			title="Next photo"
		>
			<ChevronRight aria-hidden="true" />
			<span class="sr-only">Next photo</span>
		</Button>
	{/if}
</dialog>
