<script lang="ts">
	import { onDestroy } from 'svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { formatBytes, formatDateTime, formatNumber } from '#lib/format.ts';
	import { fetchImportRun, uploadForImport, type ImportRunStatus } from '#lib/upload.ts';
	import { getArchiveStats, getImportRuns } from '../data.remote';

	const runs = $derived(await getImportRuns());

	let files = $state<FileList | undefined>();
	const file = $derived(files?.[0]);
	let phase = $state<'idle' | 'uploading' | 'importing' | 'finished'>('idle');
	let uploaded = $state(0);
	let run = $state<ImportRunStatus | null>(null);
	let failure = $state<string | null>(null);
	let destroyed = false;

	onDestroy(() => {
		destroyed = true;
	});

	async function watch(id: string) {
		while (!destroyed) {
			run = await fetchImportRun(id);
			if (run.status === 'done' || run.status === 'failed') break;
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}
	}

	async function start(event: SubmitEvent) {
		event.preventDefault();
		if (!file) return;
		phase = 'uploading';
		uploaded = 0;
		run = null;
		failure = null;
		try {
			run = await uploadForImport(file, (fraction) => (uploaded = fraction));
			phase = 'importing';
			await watch(run.id);
		} catch (error) {
			failure = error instanceof Error ? error.message : 'The upload failed.';
		} finally {
			phase = 'finished';
			void getImportRuns().refresh();
			void getArchiveStats().refresh();
		}
	}

	const busy = $derived(phase === 'uploading' || phase === 'importing');
	const statusLabels = {
		uploading: 'Uploading',
		running: 'Importing',
		done: 'Done',
		failed: 'Failed'
	};
</script>

<div class="flex flex-col gap-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>Import</Card.Title>
			<Card.Description>
				Upload the zip from X (Settings → Your account → Download an archive of your data), or a
				my-tweets export to restore a backup. Tweets are merged by id; nothing in your archive is
				removed.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form class="flex flex-col gap-4" onsubmit={start}>
				<Field.Field>
					<Field.Label for="archive">Archive zip</Field.Label>
					<Input
						id="archive"
						type="file"
						accept=".zip,application/zip"
						bind:files
						disabled={busy}
					/>
					{#if file}
						<Field.Description>{file.name} · {formatBytes(file.size)}</Field.Description>
					{/if}
				</Field.Field>
				<div>
					<Button type="submit" disabled={!file || busy}>
						{#if busy}<Spinner aria-hidden="true" />{/if}
						Upload and import
					</Button>
				</div>
			</form>

			{#if phase === 'uploading'}
				<div class="mt-4 flex flex-col gap-2" aria-live="polite">
					<Progress value={Math.round(uploaded * 100)} aria-label="Upload progress" />
					<p class="text-sm text-muted-foreground">Uploading… {Math.round(uploaded * 100)}%</p>
				</div>
			{:else if phase === 'importing' && run}
				<p class="mt-4 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
					<Spinner aria-hidden="true" />
					Importing… {formatNumber(run.tweetsAdded)} tweets added, {formatNumber(run.tweetsUpdated)} updated,
					{formatNumber(run.mediaAdded)} media files stored.
				</p>
			{:else if phase === 'finished'}
				{#if failure || run?.status === 'failed'}
					<Alert.Root variant="destructive" class="mt-4">
						<Alert.Title>Import failed</Alert.Title>
						<Alert.Description>{failure ?? run?.error}</Alert.Description>
					</Alert.Root>
				{:else if run?.status === 'done'}
					<Alert.Root class="mt-4">
						<Alert.Title>Import finished</Alert.Title>
						<Alert.Description>
							{formatNumber(run.tweetsAdded)} tweets added, {formatNumber(run.tweetsUpdated)} updated,
							{formatNumber(run.mediaAdded)} media files stored.
						</Alert.Description>
					</Alert.Root>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>

	<section class="flex flex-col gap-3" aria-labelledby="recent-imports">
		<div class="flex items-center justify-between gap-2">
			<h2 id="recent-imports" class="font-medium">Recent imports</h2>
			<Button
				variant="ghost"
				size="icon-sm"
				title="Refresh"
				onclick={() => getImportRuns().refresh()}
			>
				<RefreshCw aria-hidden="true" />
				<span class="sr-only">Refresh</span>
			</Button>
		</div>
		{#if runs.length === 0}
			<p class="text-sm text-muted-foreground">Nothing has been imported yet.</p>
		{:else}
			<div class="overflow-x-auto rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>File</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head class="text-right">Added</Table.Head>
							<Table.Head class="text-right">Updated</Table.Head>
							<Table.Head class="text-right">Media</Table.Head>
							<Table.Head>Started</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each runs as item (item.id)}
							<Table.Row>
								<Table.Cell class="max-w-48">
									<span class="block truncate" title={item.fileName}>{item.fileName}</span>
									<span class="text-xs text-muted-foreground">
										{item.kind === 'bundle'
											? 'my-tweets export'
											: item.kind === 'twitter-archive'
												? 'Twitter archive'
												: formatBytes(item.size)}
									</span>
								</Table.Cell>
								<Table.Cell>
									<Badge
										variant={item.status === 'failed'
											? 'destructive'
											: item.status === 'done'
												? 'secondary'
												: 'outline'}
										title={item.error ?? undefined}
									>
										{statusLabels[item.status]}
									</Badge>
									{#if item.error}
										<p class="mt-1 max-w-56 text-xs whitespace-normal text-muted-foreground">
											{item.error}
										</p>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatNumber(item.tweetsAdded)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatNumber(item.tweetsUpdated)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatNumber(item.mediaAdded)}
								</Table.Cell>
								<Table.Cell class="whitespace-nowrap">{formatDateTime(item.startedAt)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</section>
</div>
