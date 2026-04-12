<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDate, formatCurrency } from '$lib/format.js';
	import Expander from '$lib/components/Expander.svelte';

	let { data, form } = $props();
	let syncing = $state(false);
</script>

<svelte:head>
	<title>Accounts — EARMARK</title>
</svelte:head>

<main class="p-4 space-y-3 max-w-lg mx-auto">
	<Expander label="+ New account">
		{#snippet children(close)}
			<form
				method="POST"
				action="?/create_account"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						close();
					};
				}}
			>
				<div class="space-y-3">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="institution-name">
							Institution name
						</label>
						<input
							id="institution-name"
							name="institution_name"
							type="text"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="e.g. Cash"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="account-name">
							Account name <span class="text-gray-400 font-normal">(optional)</span>
						</label>
						<input
							id="account-name"
							name="name"
							type="text"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="e.g. Wallet"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="currency">
							Currency
						</label>
						<input
							id="currency"
							name="currency"
							type="text"
							value="GBP"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							required
						/>
					</div>
					<div class="flex gap-2">
						<button
							type="submit"
							class="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700"
						>
							Create
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

	<form
		method="POST"
		action="?/sync"
		use:enhance={() => {
			syncing = true;
			return async ({ update }) => {
				syncing = false;
				await update();
			};
		}}
	>
		<button
			type="submit"
			disabled={syncing}
			class="w-full bg-white rounded-xl border border-gray-200 p-3 text-sm font-medium text-gray-700 shadow-sm hover:shadow-md transition-shadow disabled:opacity-50"
		>
			{syncing ? 'Syncing…' : 'Sync Now'}
		</button>
	</form>

	{#if form?.synced === true}
		<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
			{form.total} transaction(s) synced across {form.accounts} account(s).{#if form.errors.length > 0}
				{' '}{form.errors.length} account(s) failed.{/if}
		</p>
	{:else if form?.synced === false}
		<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
			{form.error}
		</p>
	{/if}

	{#if data.accounts.length === 0}
		<p class="text-gray-500 text-center py-12">No accounts synced yet.</p>
	{:else}
		{#each data.accounts as account (account.id)}
			{@const bal = parseFloat(account.balance)}
			<a
				href="/accounts/{account.id}"
				class="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow"
				data-testid="account-card"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="font-medium text-gray-900">{account.institution_name}</p>
						{#if account.name}
							<p class="text-sm text-gray-500">{account.name}</p>
						{/if}
						<p class="text-xs text-gray-400 mt-1">
							{account.currency}
							{#if account.last_synced_at}
								· Synced {formatDate(account.last_synced_at.slice(0, 10))}
							{/if}
						</p>
					</div>
					<div class="flex flex-col items-end gap-1">
						<span
							class="text-sm font-semibold {bal < 0 ? 'text-red-600' : 'text-gray-900'}"
							data-testid="account-balance"
						>
							{formatCurrency(account.balance, account.currency)}
						</span>
						{#if account.unallocated_count > 0}
							<span
								class="bg-orange-50 text-orange-700 text-xs font-semibold px-2 py-1 rounded-full"
								data-testid="unallocated-badge"
							>
								{account.unallocated_count} to allocate
							</span>
						{/if}
					</div>
				</div>
			</a>
		{/each}
	{/if}
</main>
