<script lang="ts">
    import "../app.css";
    import { page } from "$app/state";
    import type { Snippet } from "svelte";
    import NavItem from "$lib/components/NavItem.svelte";

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
            class="font-mono font-bold uppercase text-white text-lg tracking-widest"
        >
            Earmark
        </a>

        <!-- Desktop: inline links (hidden on mobile) -->
        <nav class="hidden sm:flex items-center gap-6" aria-label="Global">
            <NavItem path="/accounts" name="Accounts" />
            <NavItem path="/settings" name="Settings" />
        </nav>

        <!-- Mobile: hamburger button (hidden on desktop) -->
        <button
            class="sm:hidden p-1 text-white/60 hover:text-white"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onclick={() => (menuOpen = !menuOpen)}
        >
            {#if menuOpen}
                <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            {:else}
                <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 6h16M4 12h16M4 18h16"
                    />
                </svg>
            {/if}
        </button>
    </div>

    <!-- Mobile: expanded column of links -->
    {#if menuOpen}
        <nav
            class="sm:hidden flex flex-col border-t border-white/10 pb-2 text-sm gap-1"
            aria-label="Global mobile"
        >
            <NavItem path="/accounts" name="Accounts" />
            <NavItem path="/settings" name="Settings" />
        </nav>
    {/if}
</header>

{@render children()}
