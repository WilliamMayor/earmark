<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		muted = false,
		children
	}: {
		label: string;
		muted?: boolean;
		children: Snippet<[() => void]>;
	} = $props();

	let open = $state(false);

	function close() {
		open = false;
	}
</script>

{#if open}
	<div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
		{@render children(close)}
	</div>
{:else}
	<button
		type="button"
		onclick={() => { open = true; }}
		data-testid="expander-btn"
		class="w-full bg-white rounded-xl border border-dashed p-4 text-sm transition-colors cursor-pointer
			{muted
				? 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'
				: 'border-blue-300 text-blue-600 hover:border-blue-500 hover:text-blue-700'}"
	>
		{label}
	</button>
{/if}
