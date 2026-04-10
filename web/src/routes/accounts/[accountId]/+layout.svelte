<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { AccountWithStats } from '$lib/types.js';

	let { data, children }: { data: { account: AccountWithStats }, children: Snippet } = $props();

	const accountBase = $derived(`/accounts/${data.account.id}`);
	const isEnvelopesActive = $derived(
		page.url.pathname === accountBase ||
		page.url.pathname.startsWith(`${accountBase}/envelopes`)
	);
</script>

<div class="bg-navy border-t border-white/10 px-4 pt-2 pb-0" data-testid="account-tab-bar">
	<p class="font-semibold text-white text-sm mb-1">
		{data.account.name ?? data.account.institution_name}
	</p>
	<nav class="flex flex-col sm:flex-row" aria-label="Account">
		<a
			href={accountBase}
			class="py-2 sm:py-1 sm:px-0 sm:pr-4 font-mono text-[11px] uppercase tracking-[1px] font-semibold border-l-2 sm:border-l-0 sm:border-b-2 pl-2 sm:pl-0 {isEnvelopesActive ? 'text-white border-white' : 'text-white/45 border-transparent'}"
			aria-current={isEnvelopesActive ? 'page' : undefined}
			data-testid="tab-envelopes"
		>Envelopes</a>
		<a
			href="#"
			class="py-2 sm:py-1 sm:px-0 sm:pr-4 font-mono text-[11px] uppercase tracking-[1px] font-semibold text-white/45 border-l-2 sm:border-l-0 sm:border-b-2 border-transparent pl-2 sm:pl-0"
		>Settings</a>
	</nav>
</div>

{@render children()}
