<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDate, formatSignedCurrency } from '$lib/format.js';
	import Expander from '$lib/components/Expander.svelte';

	let { data } = $props();

	const isManual = $derived(data.account.lunchflow_id === null);
</script>

<svelte:head>
	<title>Transactions — {data.account.institution_name} — EARMARK</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 p-4 space-y-3 max-w-lg mx-auto w-full">
	<Expander label="+ Add transaction" muted={!isManual}>
		{#snippet children(close)}
			<form
				method="POST"
				action="?/add_transaction"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						close();
					};
				}}
			>
				<div class="space-y-3">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="tx-description">
							Description
						</label>
						<input
							id="tx-description"
							name="description"
							type="text"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="e.g. Weekly shop"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="tx-amount">
							Amount <span class="text-gray-400 font-normal">(negative = expense)</span>
						</label>
						<input
							id="tx-amount"
							name="amount"
							type="text"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="e.g. -12.50 or 50.00"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="tx-merchant">
							Merchant <span class="text-gray-400 font-normal">(optional)</span>
						</label>
						<input
							id="tx-merchant"
							name="merchant"
							type="text"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="e.g. Tesco"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="tx-date">
							Date <span class="text-gray-400 font-normal">(optional, defaults to today)</span>
						</label>
						<input
							id="tx-date"
							name="date"
							type="date"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div class="flex gap-2">
						<button
							type="submit"
							class="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700"
						>
							Add
						</button>
						<button
							type="button"
							onclick={close}
							class="flex-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-200"
						>
							Cancel
						</button>
					</div>
				</div>
			</form>
		{/snippet}
	</Expander>

	{#if data.transactions.length === 0}
		<p class="text-gray-400 text-sm text-center py-8">No transactions yet.</p>
	{:else}
		{#each data.transactions as tx (tx.id)}
			<div
				class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
				data-testid="transaction-row"
			>
				<div class="flex items-start justify-between">
					<div class="flex-1 min-w-0">
						<p class="font-medium text-gray-900 truncate">{tx.merchant ?? tx.description}</p>
						{#if tx.merchant && tx.description}
							<p class="text-xs text-gray-400 truncate">{tx.description}</p>
						{/if}
						<p class="text-xs text-gray-400">{formatDate(tx.date)}</p>
					</div>
					<span
						class="text-sm font-semibold font-mono ml-4 shrink-0
							{tx.credit_debit_indicator === 'DBIT' ? 'text-red-600' : 'text-green-700'}"
						data-testid="transaction-amount"
					>
						{formatSignedCurrency(tx.amount, tx.currency, tx.credit_debit_indicator)}
					</span>
				</div>
			</div>
		{/each}
	{/if}
</main>
