<script lang="ts">
    import { enhance } from '$app/forms';
    import type { EnvelopeWithStats } from '$lib/types.js';

    let {
        envelope
    }: {
        envelope: EnvelopeWithStats;
    } = $props();

    let isOpen = $state(false);
</script>

<!-- Drawer body: only rendered when open, sits between card and arrow tab -->
{#if isOpen}
    <div class="mx-3 mb-0 -mt-px border border-gray-200 rounded-b-xl bg-white px-4 pt-3 pb-4 space-y-3">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Withdraw
        </p>
        <form
            method="POST"
            action="?/withdraw"
            use:enhance={() => {
                return async ({ update }) => {
                    await update();
                    isOpen = false;
                };
            }}
        >
            <input type="hidden" name="envelope_id" value={envelope.id} />
            <div class="space-y-3">
                <div>
                    <label
                        class="block text-xs text-gray-500 mb-1"
                        for="withdraw-amount-{envelope.id}"
                    >Amount</label>
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                        id="withdraw-amount-{envelope.id}"
                        name="amount"
                        type="text"
                        placeholder="e.g. 50.00"
                        required
                        autofocus
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                </div>
                <div>
                    <label
                        class="block text-xs text-gray-500 mb-1"
                        for="withdraw-note-{envelope.id}"
                    >Note <span class="text-gray-300">(optional)</span></label>
                    <input
                        id="withdraw-note-{envelope.id}"
                        name="note"
                        type="text"
                        placeholder="e.g. Cover petrol overspend"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div class="flex gap-2">
                    <button
                        type="submit"
                        class="flex-1 bg-blue-600 text-white text-xs font-medium rounded-lg py-2 hover:bg-blue-700 transition-colors"
                    >
                        Withdraw
                    </button>
                    <button
                        type="button"
                        onclick={() => { isOpen = false; }}
                        class="flex-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg py-2 hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </form>
    </div>
{/if}

<!-- Arrow tab: always the same small size, always at the bottom -->
<div class="flex -mt-px mx-3">
    <div class="flex-1"></div>
    <button
        type="button"
        onclick={() => { isOpen = !isOpen; }}
        class="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-b-lg px-5 py-1.5 text-gray-400 hover:text-gray-500 flex items-center transition-colors"
        aria-label={isOpen ? 'Close withdraw drawer' : 'Open withdraw drawer'}
    >
        <svg
            class="w-3 h-3 transition-transform duration-200"
            class:rotate-180={isOpen}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
        >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4v8M4 9l4 4 4-4"/>
        </svg>
    </button>
    <div class="w-5"></div>
</div>
