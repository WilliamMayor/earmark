<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { formatCurrency, formatDate, sumAmounts, amountsMatch } from '$lib/format.js';

	let { data } = $props();

	const { transaction: tx, splits, mode } = $derived(data);
	const { account } = $derived(data);

	// Split definition state — initialised once from server data on page load
	interface Part { amount: string; note: string }
	let parts = $state<Part[]>(
		untrack(() =>
			data.mode === 'define'
				? [{ amount: '', note: '' }, { amount: '', note: '' }]
				: data.splits.map((s) => ({ amount: s.amount, note: s.note ?? '' }))
		)
	);

	const partSum = $derived(
		parts.every((p) => p.amount && !isNaN(parseFloat(p.amount)))
			? sumAmounts(parts.map((p) => p.amount))
			: null
	);

	const totalMatches = $derived(partSum !== null && amountsMatch(partSum, tx.amount));

	function addPart() {
		parts = [...parts, { amount: '', note: '' }];
	}

	function removePart(i: number) {
		if (parts.length <= 2) return;
		parts = parts.filter((_, idx) => idx !== i);
	}
</script>

<svelte:head>
	<title>Split transaction — Budget</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
		<a
			href="/accounts/{account.id}?tx=0"
			class="text-gray-500 hover:text-gray-700"
			aria-label="Back"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<div>
			<h1 class="text-xl font-semibold text-gray-900">Split transaction</h1>
			<p class="text-sm text-gray-500">{tx.merchant ?? 'Unknown merchant'}</p>
		</div>
	</header>

	<!-- Transaction summary -->
	<div class="bg-white border-b border-gray-100 px-4 py-3 max-w-lg mx-auto">
		<div class="flex justify-between items-center">
			<div>
				<p class="font-semibold text-gray-900">{tx.merchant ?? 'Unknown merchant'}</p>
				<p class="text-xs text-gray-400">{formatDate(tx.date)}</p>
			</div>
			<p class="font-bold text-gray-900 text-lg">{formatCurrency(tx.amount, tx.currency)}</p>
		</div>
	</div>

	<main class="p-4 max-w-lg mx-auto">
		{#if mode === 'define'}
			<!-- Screen 4: Define splits -->
			<form
				method="POST"
				action="?/save_splits&tx={tx.id}"
				use:enhance
				class="space-y-3"
				data-testid="split-form"
			>
				{#each parts as part, i (i)}
					<div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
						<div class="flex items-center justify-between mb-2">
							<span class="text-sm font-medium text-gray-700">Part {i + 1}</span>
							{#if parts.length > 2}
								<button
									type="button"
									onclick={() => removePart(i)}
									class="text-xs text-red-400 hover:text-red-600"
									aria-label="Remove part"
								>
									Remove
								</button>
							{/if}
						</div>
						<div class="flex gap-2">
							<div class="w-32">
								<label class="text-xs text-gray-500 block mb-1" for="amount-{i}">Amount</label>
								<div class="relative">
									<span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
										{tx.currency === 'GBP' ? '£' : tx.currency === 'EUR' ? '€' : '$'}
									</span>
									<input
										id="amount-{i}"
										name="amount"
										type="text"
										inputmode="decimal"
										bind:value={part.amount}
										class="w-full border border-gray-300 rounded-lg pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
										data-testid="split-amount-input"
									/>
								</div>
							</div>
							<div class="flex-1">
								<label class="text-xs text-gray-500 block mb-1" for="note-{i}">Note (optional)</label>
								<input
									id="note-{i}"
									name="note"
									type="text"
									bind:value={part.note}
									class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
									placeholder="e.g. Groceries"
								/>
							</div>
						</div>
					</div>
				{/each}

				<!-- Running total -->
				<div class="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 flex justify-between items-center">
					<span class="text-sm text-gray-600">Total split</span>
					<span class={`font-semibold ${totalMatches ? 'text-green-600' : 'text-red-500'}`}>
						{partSum !== null ? formatCurrency(partSum, tx.currency) : '—'}
						/ {formatCurrency(tx.amount, tx.currency)}
					</span>
				</div>

				<button
					type="button"
					onclick={addPart}
					class="w-full bg-white rounded-xl border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
				>
					+ Add part
				</button>

				<div class="flex gap-2 pt-2">
					<button
						type="submit"
						disabled={!totalMatches}
						class="flex-1 bg-indigo-600 text-white text-sm font-medium rounded-xl py-3 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
						data-testid="save-splits-btn"
					>
						Save split
					</button>
					<button
						type="submit"
						formaction="?/cancel&tx={tx.id}"
						class="flex-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl py-3 hover:bg-gray-200"
					>
						Cancel
					</button>
				</div>
			</form>

		{:else}
			<!-- Screen 5: Allocate split parts -->
			<div class="space-y-3" data-testid="split-allocate-view">
				<p class="text-sm text-gray-500 text-center">
					Allocate each part to an envelope
				</p>

				{#each splits as split, i (split.id)}
					<div
						class="bg-white rounded-xl border p-4 shadow-sm {split.is_allocated ? 'border-green-200 bg-green-50' : 'border-gray-200'}"
						data-testid="split-part"
					>
						<div class="flex items-start justify-between">
							<div>
								<p class="text-xs text-gray-400 font-medium mb-1">Part {i + 1} of {splits.length}</p>
								<p class="font-semibold text-gray-900">{formatCurrency(split.amount, tx.currency)}</p>
								{#if split.note}<p class="text-xs text-gray-500 mt-0.5">{split.note}</p>{/if}
							</div>
							{#if split.is_allocated}
								<span class="text-green-600 text-sm font-medium flex items-center gap-1">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
									{split.envelope_name}
								</span>
							{:else}
								<span class="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-1 rounded-full">
									Unallocated
								</span>
							{/if}
						</div>
					</div>
				{/each}

				<!-- Envelope allocation buttons (shown for first unallocated split) -->
				{#if splits.find((s) => !s.is_allocated)}
					{@const unallocatedSplit = splits.find((s) => !s.is_allocated)}
					<div class="pt-2">
						<p class="text-xs text-gray-500 mb-2">
							Allocate {formatCurrency(unallocatedSplit.amount, tx.currency)} to:
						</p>
						<div class="space-y-2">
							{#each data.envelopes as envelope (envelope.id)}
								<form
									method="POST"
									action="/accounts/{account.id}?/allocate"
									use:enhance
								>
									<input type="hidden" name="envelope_id" value={envelope.id} />
									<input type="hidden" name="split_id" value={unallocatedSplit.id} />
									<input type="hidden" name="current_index" value="0" />
									<button
										type="submit"
										class="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
										data-testid="split-allocate-btn"
									>
										<span class="font-medium text-gray-900">{envelope.name}</span>
										<span class="text-sm text-gray-400">
											{formatCurrency(envelope.allocated_total, tx.currency)}
										</span>
									</button>
								</form>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Cancel split (go back to single default) -->
				<form method="POST" action="?/cancel&tx={tx.id}" use:enhance class="pt-2">
					<button
						type="submit"
						class="w-full bg-gray-100 text-gray-600 text-sm font-medium rounded-xl py-3 hover:bg-gray-200"
					>
						Undo split
					</button>
				</form>
			</div>
		{/if}
	</main>
</div>
