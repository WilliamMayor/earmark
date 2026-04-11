<script lang="ts">
    import { page } from "$app/state";
    import type { Snippet } from "svelte";
    import type { AccountWithStats } from "$lib/types.js";
    import NavItem from "$lib/components/NavItem.svelte";

    let {
        data,
        children,
    }: { data: { account: AccountWithStats }; children: Snippet } = $props();

    const accountBase = $derived(`/accounts/${data.account.id}`);
</script>

<div
    class="bg-navy border-t border-white pb-2 md:pl-2"
    data-testid="account-tab-bar"
>
    <h2 class="font-semibold text-white text-sm mb-1 py-2 pl-2 md:pl-0">
        {data.account.institution_name} - {data.account.name}
    </h2>
    <nav class="flex flex-col sm:flex-row text-sm gap-1" aria-label="Account">
        <NavItem
            path={accountBase}
            name="Envelopes"
            data-testid="tab-envelopes"
        />
        <NavItem path={accountBase + "/settings"} name="Settings" />
    </nav>
</div>

{@render children()}
