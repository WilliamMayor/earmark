<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDate } from '$lib/format.js';

	let { data, form } = $props();
	let syncing = $state(false);
</script>

<svelte:head>
	<title>Accounts — EARMARK</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<header class="bg-navy px-4 py-4 flex items-center justify-between">
		<span class="font-mono font-bold uppercase tracking-[3.5px] text-white text-[13px]">EARMARK</span>
		<span class="font-mono font-bold uppercase tracking-[2px] text-white/40 text-[11px]">Accounts</span>
	</header>

	<main class="p-4 space-y-3 max-w-lg mx-auto">
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
						{#if account.unallocated_count > 0}
							<span
								class="bg-orange-50 text-orange-700 text-xs font-semibold px-2 py-1 rounded-full"
								data-testid="unallocated-badge"
							>
								{account.unallocated_count} to allocate
							</span>
						{/if}
					</div>
				</a>
			{/each}
		{/if}
	</main>
</div>
