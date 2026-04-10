<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { formatCurrency, formatDate, formatSignedCurrency } from '$lib/format.js';
	import { inferGoalType, getRemainingAmount, getEstimatedCompletion } from '$lib/goal-utils.js';

	let { data } = $props();

	let showNewEnvelopeForm = $state(false);
	let newEnvelopeName = $state('');
	let showAddSplitForm = $state(false);
	let addSplitAmount = $state('');
	let addSplitNote = $state('');
	let selectedSplitId = $state<number | null>(null);
	const activeSplitId = $derived.by(() => {
		const splits = data.currentSplits;
		if (selectedSplitId !== null && splits.some(s => s.id === selectedSplitId && !s.is_allocated)) {
			return selectedSplitId;
		}
		return splits.find(s => !s.is_allocated)?.id ?? null;
	});

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

	const account = $derived(data.account);
</script>

<svelte:head>
	<title>{account.name ?? account.institution_name} — EARMARK</title>
</svelte:head>

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
			class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
			class:bg-blue-600={account.round_up_since !== null}
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
				return async ({ update }) => {
					await update();
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
				class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
				placeholder="e.g. Groceries"
				required
						autofocus
			/>
			<div class="flex gap-2 mt-3">
				<button
					type="submit"
					class="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700"
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
			class="w-full bg-white rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
			data-testid="new-envelope-btn"
		>
			+ New envelope
		</button>
	{/if}

	<!-- Envelope cards -->
	{#each data.envelopes as envelope (envelope.id)}
		{@const envGoalType = inferGoalType(envelope)}
		{@const remaining = envGoalType !== null ? getRemainingAmount(envelope) : 0}
		{@const goalAmount = envelope.goal_amount ? parseFloat(envelope.goal_amount) : 0}
		{@const balance = envelope.goal_balance}
		{@const unallocatedSplit = (data.mode === 'allocate' && data.currentTx && activeSplitId !== null)
			? (data.currentSplits.find(s => s.id === activeSplitId) ?? null)
			: null}
		{@const projectedBalance = unallocatedSplit && data.currentTx
			? (data.currentTx.credit_debit_indicator === 'CRDT'
				? balance + parseFloat(unallocatedSplit.amount)
				: balance - parseFloat(unallocatedSplit.amount))
			: null}
		{@const isFunded = envGoalType !== null && remaining === 0}
		{@const progressPct = envGoalType !== null && goalAmount > 0
			? Math.min(100, Math.round((envelope.goal_balance / goalAmount) * 100))
			: envelope.percent_of_total}
		{@const estCompletion = envGoalType === 'open_ended'
			? getEstimatedCompletion(envelope, envelope.goal_balance, new Date())
			: null}
		<a
			href="/accounts/{account.id}/envelopes/{envelope.id}"
			class="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-blue-300 transition-colors"
			data-testid="envelope-card"
		>
			<div class="flex items-start justify-between mb-2">
				<div class="flex-1 min-w-0">
					<p class="font-medium text-gray-900 truncate">{envelope.name}</p>
					{#if envGoalType === null}
						<p class="text-xs text-gray-400">{progressPct.toFixed(0)}% of spend</p>
					{:else if envGoalType === 'recurring' || envGoalType === 'one_off'}
						<p class="text-xs text-gray-400">
							{#if envelope.goal_due_date}
								Due {formatDate(envelope.goal_due_date)}
							{:else if envelope.goal_dtstart}
								Recurring
							{/if}
						</p>
					{:else if envGoalType === 'open_ended'}
						<p class="text-xs text-gray-400">
							{#if estCompletion}
								est. {estCompletion.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
							{:else}
								Open-ended
							{/if}
						</p>
					{/if}
				</div>
				<div class="text-right ml-4 shrink-0">
					<p class="text-xl font-bold font-mono text-gray-900">
						{formatCurrency(balance.toFixed(2), account.currency)}
					</p>
					{#if envGoalType !== null}
						<p class="text-xs text-gray-400">of {formatCurrency(envelope.goal_amount!, account.currency)}</p>
					{/if}
					{#if projectedBalance !== null}
						<p class="text-xs text-gray-400">→ <span class="font-mono">{formatCurrency(projectedBalance.toFixed(2), account.currency)}</span></p>
					{/if}
				</div>
			</div>

			<!-- Progress bar -->
			<div class="w-full bg-gray-100 rounded-full h-1.5 mb-2">
				<div
					class="h-1.5 rounded-full transition-all duration-300"
					class:bg-green-500={isFunded}
					class:bg-indigo-500={!isFunded && envGoalType !== null}
					class:bg-blue-600={envGoalType === null}
					style="width: {progressPct}%"
				></div>
			</div>

			<!-- Status line + allocate button -->
			<div class="flex items-center justify-between">
				{#if envGoalType !== null}
					{#if isFunded}
						<p class="text-xs text-green-600 font-medium">Goal reached</p>
					{:else}
						<p class="text-xs text-gray-500">
							{formatCurrency(remaining.toFixed(2), account.currency)} still needed
						</p>
					{/if}
				{:else}
					<span></span>
				{/if}

				{#if data.mode === 'allocate' && data.currentTx && unallocatedSplit}
					<form
						method="POST"
						action="?/allocate"
						use:enhance
						onclick={(e) => e.stopPropagation()}
					>
						<input type="hidden" name="envelope_id" value={envelope.id} />
						<input type="hidden" name="split_id" value={unallocatedSplit.id} />
						<input type="hidden" name="current_index" value={data.currentTxIndex} />
						<button
							type="submit"
							class="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700"
							data-testid="allocate-btn"
						>
							Allocate {formatCurrency(parseFloat(unallocatedSplit.amount).toFixed(2), account.currency)}
						</button>
					</form>
				{/if}
			</div>
		</a>
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
					<p class="font-bold text-gray-900 font-mono"
					   class:text-red-600={tx.credit_debit_indicator === 'DBIT'}>
						{formatSignedCurrency(tx.amount, tx.currency, tx.credit_debit_indicator)}
					</p>
				</div>
			</div>

			<!-- Split management -->
			<div class="mt-2 space-y-2">
				{#each splits as split (split.id)}
					{@const isActiveSplit = !split.is_allocated && split.id === activeSplitId}
					<div
						class="rounded-lg p-2 text-sm border"
						class:border-blue-400={isActiveSplit}
						class:border-gray-100={!isActiveSplit}
						class:cursor-pointer={!split.is_allocated}
						onclick={() => { if (!split.is_allocated) selectedSplitId = split.id; }}
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0">
								{#if !split.is_allocated}
									<div
										class="shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
										class:border-blue-500={isActiveSplit}
										class:border-gray-300={!isActiveSplit}
									>
										{#if isActiveSplit}
											<div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
										{/if}
									</div>
								{/if}
								{#if split.is_round_up}
									<span class="text-xs text-purple-600 font-medium shrink-0">Round Up</span>
								{/if}
								<span class="font-medium text-gray-900 font-mono"
								      class:text-red-600={tx.credit_debit_indicator === 'DBIT'}>
									{formatSignedCurrency(split.amount, tx.currency, tx.credit_debit_indicator)}
								</span>
								{#if split.note}<span class="text-gray-400 truncate">— {split.note}</span>{/if}
								{#if split.is_allocated && split.envelope_name}
									<span class="text-green-600 ml-1 shrink-0">{split.envelope_name}</span>
								{/if}
							</div>
							<div class="flex items-center gap-1 shrink-0">
								{#if split.is_default && !split.is_round_up}
									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); showAddSplitForm = !showAddSplitForm; addSplitAmount = ''; addSplitNote = ''; }}
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
											onclick={(e) => { e.stopPropagation(); if (!confirm('Delete this split?')) e.preventDefault(); }}
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
						class="mt-2 border border-blue-200 rounded-lg p-3 space-y-2 bg-blue-50"
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
								class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
								class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div class="flex gap-2">
							<button
								type="submit"
								class="flex-1 bg-blue-600 text-white text-xs font-medium rounded py-1.5 hover:bg-blue-700"
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
