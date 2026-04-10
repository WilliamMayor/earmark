<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let menuOpen = $state(false);

	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});
</script>

<header class="bg-navy">
	<div class="flex items-center justify-between px-4 py-3">
		<a
			href="/accounts"
			class="font-mono font-bold uppercase tracking-[3.5px] text-white text-[13px]"
		>EARMARK</a>

		<!-- Desktop: inline links (hidden on mobile) -->
		<nav class="hidden sm:flex items-center gap-6" aria-label="Global">
			<a
				href="/accounts"
				class="font-mono text-[11px] uppercase tracking-[1.5px] font-semibold {page.url.pathname.startsWith('/accounts') ? 'text-white' : 'text-white/50'}"
				aria-current={page.url.pathname.startsWith('/accounts') ? 'page' : undefined}
			>Accounts</a>
			<a
				href="#"
				class="font-mono text-[11px] uppercase tracking-[1.5px] font-semibold text-white/50"
			>Settings</a>
		</nav>

		<!-- Mobile: hamburger button (hidden on desktop) -->
		<button
			class="sm:hidden p-1 text-white/60 hover:text-white"
			aria-label={menuOpen ? 'Close menu' : 'Open menu'}
			onclick={() => (menuOpen = !menuOpen)}
		>
			{#if menuOpen}
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			{:else}
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			{/if}
		</button>
	</div>

	<!-- Mobile: expanded column of links -->
	{#if menuOpen}
		<nav class="sm:hidden flex flex-col border-t border-white/10 pb-2" aria-label="Global mobile">
			<a
				href="/accounts"
				class="py-2 pl-3 font-mono text-[11px] uppercase tracking-[1.5px] font-semibold border-l-2 {page.url.pathname.startsWith('/accounts') ? 'text-white border-white' : 'text-white/50 border-transparent'}"
				aria-current={page.url.pathname.startsWith('/accounts') ? 'page' : undefined}
			>Accounts</a>
			<a
				href="#"
				class="py-2 pl-3 font-mono text-[11px] uppercase tracking-[1.5px] font-semibold text-white/50 border-l-2 border-transparent"
			>Settings</a>
		</nav>
	{/if}
</header>

{@render children()}
