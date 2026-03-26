<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { formatCurrency, formatDate } from '$lib/format.js';

	let { data } = $props();

	let showNewEnvelopeForm = $state(false);
	let newEnvelopeName = $state('');
	let renamingId = $state<number | null>(null);
	let renameValue = $state('');
	let showAddSplitForm = $state(false);
	let addSplitAmount = $state('');
	let addSplitNote = $state('');

	// Swipe state
	let touchStartX = $state(0);

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
	}

	function handleTouchEnd(e: TouchEvent) {
		const delta = e.changedTouches[0].clientX - touchStartX;
		if (Math.abs(delta) < 50) return;

		const { unallocated, currentTxIndex } = data;
		if (unallocated.length === 0) return;

		const nextIndex =
			delta < 0
				? Math.min(currentTxIndex + 1, unallocated.length - 1)
				: Math.max(currentTxIndex - 1, 0);

		if (nextIndex !== currentTxIndex) {
			goto(`?tx=${nextIndex}`, { replaceState: true });
		}
	}

	function startRename(id: number, currentName: string) {
		renamingId = id;
		renameValue = currentName;
	}

	function cancelRename() {
		renamingId = null;
		renameValue = '';
	}

	const account = $derived(data.account);
</script>

<svelte:head>
	<title>{account.name ?? account.institution_name} — Budget</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col">
	<!-- Header -->
	<header class="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
		<a href="/accounts" class="text-gray-500 hover:text-gray-700" aria-label="Back">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<div>
			<h1 class="text-xl font-semibold text-gray-900">{account.name ?? account.institution_name}</h1>
			<p class="text-xs text-gray-400">{account.institution_name} · {account.currency}</p>
		</div>
	</header>

	<!-- Round-up toggle -->
	<div class="bg-white border-b border-gray-200 px-4 py-3 max-w-lg mx-auto w-full">
		<form method="POST" action="?/toggle_round_up" use:enhance class="flex items-center justify-between gap-3">
			<div>
				<p class="text-sm font-medium text-gray-900">Round Up</p>
				<p class="text-xs text-gray-500">Save the spare change from every transaction</p>
			</div>
			<input type="hidden" name="enabled" value={account.round_up_since !== null ? '0' : '1'} />
			<button
				type="submit"
				class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
				class:bg-indigo-600={account.round_up_since !== null}
				class:bg-gray-200={account.round_up_since === null}
				role="switch"
				aria-checked={account.round_up_since !== null}
				aria-label="Toggle round up"
			>
				<span
					class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200"
					class:translate-x-5={account.round_up_since !== null}
					class:translate-x-0={account.round_up_since === null}
				></span>
			</button>
		</form>
	</div>

	<!-- Envelope list (scrollable, leaves room for dock) -->
	<main class="flex-1 overflow-y-auto p-4 space-y-3 max-w-lg mx-auto w-full"
		class:pb-48={data.mode === 'allocate'}>

		<!-- New envelope form -->
		{#if showNewEnvelopeForm}
			<form
				method="POST"
				action="?/create_envelope"
				use:enhance={() => {
					return ({ update }) => {
						update();
						showNewEnvelopeForm = false;
						newEnvelopeName = '';
					};
				}}
				class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
			>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="new-envelope-name">
					Envelope name
				</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="new-envelope-name"
					name="name"
					type="text"
					bind:value={newEnvelopeName}
					class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					placeholder="e.g. Groceries"
					required
							autofocus
				/>
				<div class="flex gap-2 mt-3">
					<button
						type="submit"
						class="flex-1 bg-indigo-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-700"
					>
						Create
					</button>
					<button
						type="button"
						onclick={() => { showNewEnvelopeForm = false; newEnvelopeName = ''; }}
						class="flex-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-200"
					>
						Cancel
					</button>
				</div>
			</form>
		{:else}
			<button
				onclick={() => { showNewEnvelopeForm = true; }}
				class="w-full bg-white rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
				data-testid="new-envelope-btn"
			>
				+ New envelope
			</button>
		{/if}

		<!-- Envelope cards -->
		{#each data.envelopes as envelope (envelope.id)}
			<div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm" data-testid="envelope-card">
				{#if renamingId === envelope.id}
					<!-- Rename form -->
					<form
						method="POST"
						action="?/rename_envelope"
						use:enhance={() => ({ update }) => { update(); cancelRename(); }}
					>
						<input type="hidden" name="envelope_id" value={envelope.id} />
						<!-- svelte-ignore a11y_autofocus -->
						<input
							name="name"
							type="text"
							bind:value={renameValue}
							class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
							autofocus
						/>
						<div class="flex gap-2">
							<button type="submit" class="text-xs text-indigo-600 font-medium">Save</button>
							<button type="button" onclick={cancelRename} class="text-xs text-gray-500">Cancel</button>
						</div>
					</form>
				{:else}
					<div class="flex items-start justify-between mb-3">
						<div>
							<p class="font-medium text-gray-900">{envelope.name}</p>
							<p class="text-sm text-gray-500">
								{formatCurrency(envelope.allocated_total, account.currency)}
							</p>
						</div>
						<div class="flex items-center gap-1">
							{#if data.mode === 'allocate' && data.currentTx}
								{@const unallocatedSplit = data.currentSplits.find(s => !s.is_allocated)}
								{#if unallocatedSplit}
									<form method="POST" action="?/allocate" use:enhance>
										<input type="hidden" name="envelope_id" value={envelope.id} />
										<input type="hidden" name="split_id" value={unallocatedSplit.id} />
										<input type="hidden" name="current_index" value={data.currentTxIndex} />
										<button
											type="submit"
											class="bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700"
											data-testid="allocate-btn"
										>
											Allocate
										</button>
									</form>
								{/if}
							{/if}
							<button
								onclick={() => startRename(envelope.id, envelope.name)}
								class="p-1.5 text-gray-400 hover:text-gray-600 rounded"
								aria-label="Rename envelope"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
										d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
								</svg>
							</button>
							<form method="POST" action="?/delete_envelope" use:enhance>
								<input type="hidden" name="envelope_id" value={envelope.id} />
								<button
									type="submit"
									class="p-1.5 text-gray-400 hover:text-red-500 rounded"
									aria-label="Delete envelope"
									onclick={(e) => {
										if (!confirm(`Delete "${envelope.name}"?`)) e.preventDefault();
									}}
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</form>
						</div>
					</div>

					<!-- Balance bar -->
					<div class="w-full bg-gray-100 rounded-full h-1.5">
						<div
							class="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
							style="width: {envelope.percent_of_total}%"
						></div>
					</div>
				{/if}
			</div>
		{/each}
	</main>

	<!-- Dock: pinned to bottom when in allocate mode -->
	{#if data.mode === 'allocate' && data.currentTx}
		{@const tx = data.currentTx}
		{@const splits = data.currentSplits}
		{@const isMultiSplit = splits.length > 1}
		{@const unallocatedSplits = splits.filter(s => !s.is_allocated)}

		<div
			role="region"
			aria-label="Transaction allocation"
			class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg max-w-lg mx-auto"
			ontouchstart={handleTouchStart}
			ontouchend={handleTouchEnd}
			data-testid="allocation-dock"
		>
			<!-- Navigation -->
			<div class="flex items-center justify-between px-4 pt-3 pb-1">
				<button
					onclick={() => goto(`?tx=${Math.max(0, data.currentTxIndex - 1)}`, { replaceState: true })}
					disabled={data.currentTxIndex === 0}
					class="p-1 text-gray-400 disabled:opacity-30 hover:text-gray-600"
					aria-label="Previous transaction"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
				</button>

				<span class="text-xs text-gray-400">
					{data.currentTxIndex + 1} of {data.unallocated.length}
					{#if isMultiSplit}
						· ✂ Split ({unallocatedSplits.length} parts left)
					{/if}
				</span>

				<button
					onclick={() => goto(`?tx=${Math.min(data.unallocated.length - 1, data.currentTxIndex + 1)}`, { replaceState: true })}
					disabled={data.currentTxIndex === data.unallocated.length - 1}
					class="p-1 text-gray-400 disabled:opacity-30 hover:text-gray-600"
					aria-label="Next transaction"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>

			<!-- Transaction card -->
			<div class="px-4 pb-4">
				<div class="flex items-start justify-between mb-1">
					<div class="flex-1 min-w-0">
						<p class="font-semibold text-gray-900 truncate">{tx.merchant ?? 'Unknown merchant'}</p>
						{#if tx.description}
							<p class="text-xs text-gray-400 truncate">{tx.description}</p>
						{/if}
						<p class="text-xs text-gray-400">{formatDate(tx.date)}</p>
					</div>
					<div class="text-right ml-4 shrink-0">
						<p class="font-bold text-gray-900">{formatCurrency(tx.amount, tx.currency)}</p>
						{#if isMultiSplit && unallocatedSplits.length > 0}
							<p class="text-xs text-indigo-600 font-medium">
								Next: {formatCurrency(unallocatedSplits[0].amount, tx.currency)}
							</p>
						{/if}
					</div>
				</div>

				<!-- Split management -->
				<div class="mt-2 space-y-2">
					{#each splits as split (split.id)}
						<div class="border border-gray-100 rounded-lg p-2 text-sm">
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2 min-w-0">
									{#if split.is_round_up}
										<span class="text-xs text-purple-600 font-medium shrink-0">Round Up</span>
									{:else if split.is_default}
										<span class="text-xs text-gray-400 shrink-0">Default</span>
									{/if}
									<span class="font-medium text-gray-900">{formatCurrency(split.amount, tx.currency)}</span>
									{#if split.note}<span class="text-gray-400 truncate">— {split.note}</span>{/if}
									{#if split.is_allocated && split.envelope_name}
										<span class="text-green-600 ml-1 shrink-0">{split.envelope_name}</span>
									{/if}
								</div>
								<div class="flex items-center gap-1 shrink-0">
									{#if split.is_default && !split.is_round_up}
										<button
											type="button"
											onclick={() => { showAddSplitForm = !showAddSplitForm; addSplitAmount = ''; addSplitNote = ''; }}
											class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200"
											data-testid="split-btn"
										>
											✂ Split
										</button>
									{/if}
									{#if !split.is_default && !split.is_round_up}
										<form method="POST" action="?/delete_split" use:enhance>
											<input type="hidden" name="split_id" value={split.id} />
											<input type="hidden" name="current_index" value={data.currentTxIndex} />
											<button
												type="submit"
												class="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
												onclick={(e) => { if (!confirm('Delete this split?')) e.preventDefault(); }}
											>
												Delete
											</button>
										</form>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Add split form (inline, toggled by Split button) -->
				{#if showAddSplitForm}
					{@const defaultSplit = splits.find(s => s.is_default)}
					{#if defaultSplit}
						<form
							method="POST"
							action="?/create_split"
							use:enhance={() => ({ update }) => { update(); showAddSplitForm = false; addSplitAmount = ''; addSplitNote = ''; }}
							class="mt-2 border border-indigo-200 rounded-lg p-3 space-y-2 bg-indigo-50"
						>
							<input type="hidden" name="tx_id" value={tx.id} />
							<input type="hidden" name="current_index" value={data.currentTxIndex} />
							<div>
								<label class="block text-xs font-medium text-gray-700 mb-1" for="split-amount">Amount</label>
								<input
									id="split-amount"
									name="amount"
									type="text"
									bind:value={addSplitAmount}
									placeholder="e.g. 12.50"
									required
									class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-gray-700 mb-1" for="split-note">Note (optional)</label>
								<input
									id="split-note"
									name="note"
									type="text"
									bind:value={addSplitNote}
									placeholder="e.g. Coffee"
									class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
								/>
							</div>
							<div class="flex gap-2">
								<button
									type="submit"
									class="flex-1 bg-indigo-600 text-white text-xs font-medium rounded py-1.5 hover:bg-indigo-700"
								>
									Add split
								</button>
								<button
									type="button"
									onclick={() => { showAddSplitForm = false; addSplitAmount = ''; addSplitNote = ''; }}
									class="flex-1 bg-gray-100 text-gray-700 text-xs font-medium rounded py-1.5 hover:bg-gray-200"
								>
									Cancel
								</button>
							</div>
						</form>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
