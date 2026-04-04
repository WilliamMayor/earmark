<script lang="ts">
    import { enhance } from '$app/forms';
    import { formatCurrency, formatDate } from '$lib/format.js';
    import {
        inferGoalType,
        getRemainingAmount,
        getDaysRemaining,
        getRates,
        getEstimatedCompletion,
        getMilestones,
        formatGoalDescription,
        buildRrule
    } from '$lib/goal-utils.js';

    let { data, form } = $props();

    const account  = $derived(data.account);
    const envelope = $derived(data.envelope);
    const goalType = $derived(inferGoalType(envelope));

    // Editing state
    let renamingEnvelope = $state(false);
    let renameValue      = $state('');
    let showGoalEditor   = $state(false);
    let confirmDelete    = $state(false);

    // Goal editor form state
    let editorType     = $state<'recurring' | 'one_off' | 'open_ended'>('open_ended');
    let editorAmount   = $state('');
    let editorFreq     = $state<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('MONTHLY');
    let editorByDay    = $state('MO');
    let editorByMonthDay = $state(1);
    let editorByMonth  = $state(1);
    let editorDueDate  = $state('');

    // Derived rrule string for recurring editor
    const derivedRrule = $derived.by(() => {
        if (editorType !== 'recurring') return '';
        try {
            const { rrule } = buildRrule(editorFreq, {
                byDay:       editorFreq === 'WEEKLY'  ? editorByDay                                : undefined,
                byMonthDay:  editorFreq === 'MONTHLY' ? editorByMonthDay
                           : editorFreq === 'YEARLY'  ? editorByMonthDay                          : undefined,
                byMonth:     editorFreq === 'YEARLY'  ? editorByMonth                             : undefined,
                dtstart:     new Date()
            });
            return rrule;
        } catch {
            return '';
        }
    });

    // Derived dtstart (default to today for recurring)
    const derivedDtstart = $derived.by(() => {
        if (editorType !== 'recurring') return '';
        try {
            const { dtstart } = buildRrule(editorFreq, {
                byDay:       editorFreq === 'WEEKLY'  ? editorByDay      : undefined,
                byMonthDay:  (editorFreq === 'MONTHLY' || editorFreq === 'YEARLY') ? editorByMonthDay : undefined,
                byMonth:     editorFreq === 'YEARLY'  ? editorByMonth    : undefined,
                dtstart:     new Date()
            });
            return dtstart;
        } catch {
            return '';
        }
    });

    function openGoalEditor() {
        // Pre-fill from existing goal
        if (goalType) {
            editorType   = goalType;
            editorAmount = envelope.goal_amount ?? '';
            if (goalType === 'one_off') editorDueDate = envelope.goal_due_date ?? '';
        } else {
            editorType   = 'open_ended';
            editorAmount = '';
        }
        showGoalEditor = true;
    }

    // Computed goal display values
    const remaining        = $derived(getRemainingAmount(envelope));
    const daysRemaining    = $derived(getDaysRemaining(envelope));
    const rates            = $derived(getRates(envelope));
    const estimatedDate    = $derived(getEstimatedCompletion(envelope, data.netContributed));
    const milestones       = $derived(getMilestones(envelope));
    const goalDescription  = $derived(formatGoalDescription(envelope));

    const goalPercent = $derived.by(() => {
        if (!envelope.goal_amount) return 0;
        const target = parseFloat(envelope.goal_amount);
        return target > 0 ? Math.min((envelope.goal_balance / target) * 100, 100) : 0;
    });

    const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const DAY_LABELS: Record<string, string> = {
        SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday',
        TH: 'Thursday', FR: 'Friday', SA: 'Saturday'
    };
</script>

<svelte:head>
    <title>{envelope.name} — EARMARK</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 flex flex-col">
    <!-- Header -->
    <header class="bg-navy px-4 py-4 flex items-center gap-3">
        <a href="/accounts/{account.id}" class="text-white/60 hover:text-white" aria-label="Back">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
        </a>
        <div class="flex-1">
            {#if renamingEnvelope}
                <form method="POST" action="?/rename_envelope" use:enhance={() => ({ update }) => { update(); renamingEnvelope = false; }}>
                    <input name="name" type="text" bind:value={renameValue}
                        class="bg-white/10 text-white rounded px-2 py-0.5 text-lg font-semibold w-full focus:outline-none focus:ring-2 focus:ring-white/40"
                        autofocus />
                </form>
            {:else}
                <button onclick={() => { renamingEnvelope = true; renameValue = envelope.name; }}
                    class="text-xl font-semibold text-white hover:text-white/80 text-left">
                    {envelope.name}
                </button>
            {/if}
            <p class="text-xs text-white/50">{account.name ?? account.institution_name}</p>
        </div>
        <!-- Delete button -->
        {#if confirmDelete}
            <form method="POST" action="?/delete_envelope" use:enhance>
                <button type="submit" class="text-xs text-red-300 font-medium px-2 py-1 rounded border border-red-300/50 hover:bg-red-500/20">
                    Confirm delete
                </button>
            </form>
            <button onclick={() => confirmDelete = false} class="text-xs text-white/50 px-2">Cancel</button>
        {:else}
            <button onclick={() => confirmDelete = true} class="p-1.5 text-white/40 hover:text-red-300 rounded" aria-label="Delete envelope">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        {/if}
    </header>

    <main class="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">

        {#if form?.error}
            <div class="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {form.error}
            </div>
        {/if}

        <!-- Goal card -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">

            {#if goalType && !showGoalEditor}
                <!-- Goal progress display -->
                <div class="flex items-start justify-between mb-1">
                    <p class="text-xs uppercase tracking-wide text-gray-400 font-medium">Goal</p>
                    <div class="flex gap-3 text-xs">
                        <button onclick={openGoalEditor} class="text-indigo-500 hover:text-indigo-700">Edit</button>
                        <form method="POST" action="?/remove_goal" use:enhance class="inline">
                            <button type="submit" class="text-gray-400 hover:text-red-500">Remove</button>
                        </form>
                    </div>
                </div>

                <p class="text-sm text-gray-700 mb-0.5">{goalDescription}</p>

                {#if goalType !== 'open_ended' && daysRemaining !== null}
                    <p class="text-xs text-gray-400 mb-3">
                        {#if daysRemaining > 0}
                            {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
                        {:else if daysRemaining === 0}
                            Due today
                        {:else}
                            Overdue by {Math.abs(daysRemaining)} day{Math.abs(daysRemaining) === 1 ? '' : 's'}
                        {/if}
                    </p>
                {:else if goalType === 'open_ended' && estimatedDate}
                    <p class="text-xs text-gray-400 mb-3">
                        At your current rate: done by {formatDate(estimatedDate.toISOString().slice(0,10))}
                    </p>
                {:else}
                    <div class="mb-3"></div>
                {/if}

                <!-- Progress bar -->
                <div class="bg-gray-100 rounded-full h-2 mb-2">
                    <div
                        class="h-2 rounded-full transition-all"
                        class:bg-green-500={goalPercent >= 100}
                        class:bg-indigo-500={goalPercent < 100}
                        style="width: {goalPercent}%"
                    ></div>
                </div>
                <div class="flex justify-between text-xs text-gray-500 mb-4">
                    <span>{formatCurrency(envelope.goal_balance.toFixed(2), account.currency)} saved</span>
                    <span>{formatCurrency(remaining.toFixed(2), account.currency)} remaining</span>
                </div>

                {#if goalType !== 'open_ended' && rates}
                    <!-- Rate table -->
                    <div class="bg-gray-50 rounded-lg p-3">
                        <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">To reach goal on time</p>
                        <div class="grid grid-cols-3 gap-2 text-center">
                            <div>
                                <p class="text-base font-semibold text-gray-800">{formatCurrency(rates.perDay.toFixed(2), account.currency)}</p>
                                <p class="text-xs text-gray-400 mt-0.5">per day</p>
                            </div>
                            <div>
                                <p class="text-base font-semibold text-gray-800">{formatCurrency(rates.perWeek.toFixed(2), account.currency)}</p>
                                <p class="text-xs text-gray-400 mt-0.5">per week</p>
                            </div>
                            <div>
                                <p class="text-base font-semibold text-gray-800">{formatCurrency(rates.perMonth.toFixed(2), account.currency)}</p>
                                <p class="text-xs text-gray-400 mt-0.5">per month</p>
                            </div>
                        </div>
                    </div>
                {/if}

                {#if goalType === 'open_ended' && milestones}
                    <!-- Milestone table -->
                    <div class="bg-gray-50 rounded-lg p-3">
                        <p class="text-xs text-gray-400 uppercase tracking-wide mb-3">Reach your goal in...</p>
                        <div class="space-y-2">
                            {#each milestones as milestone, i}
                                {#if i > 0}<div class="border-t border-gray-200"></div>{/if}
                                <div class="flex items-center justify-between py-0.5">
                                    <div>
                                        <span class="text-sm font-semibold text-gray-800">
                                            {formatCurrency(milestone.monthlyAmount.toFixed(2), account.currency)}
                                        </span>
                                        <span class="text-xs text-gray-400"> / month</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xs text-gray-600">{milestone.months} months</span>
                                        <span class="text-xs text-gray-400"> · {new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(milestone.targetDate)}</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

            {:else if !showGoalEditor}
                <!-- No goal set -->
                <p class="text-sm text-gray-500 mb-3">No goal set for this envelope.</p>
                <button onclick={openGoalEditor}
                    class="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                    + Set a goal
                </button>
            {/if}

            {#if showGoalEditor}
                <!-- Goal editor form -->
                <form method="POST" action="?/set_goal" use:enhance={() => ({ update }) => { update(); showGoalEditor = false; }}>
                    <!-- Type tabs -->
                    <div class="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
                        {#each (['recurring', 'one_off', 'open_ended'] as const) as type}
                            <button
                                type="button"
                                onclick={() => editorType = type}
                                class="flex-1 text-xs py-1.5 rounded-md font-medium transition-colors"
                                class:bg-white={editorType === type}
                                class:text-gray-900={editorType === type}
                                class:shadow-sm={editorType === type}
                                class:text-gray-500={editorType !== type}
                            >
                                {type === 'one_off' ? 'One-off' : type === 'open_ended' ? 'Open-ended' : 'Recurring'}
                            </button>
                        {/each}
                    </div>

                    <input type="hidden" name="goal_type" value={editorType} />

                    <!-- Amount -->
                    <div class="mb-3">
                        <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1" for="goal-amount">
                            Target amount
                        </label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{account.currency === 'GBP' ? '£' : account.currency}</span>
                            <input
                                id="goal-amount"
                                name="amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                bind:value={editorAmount}
                                class="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    {#if editorType === 'recurring'}
                        <!-- Repeats frequency -->
                        <div class="mb-3">
                            <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1" for="goal-freq">
                                Repeats
                            </label>
                            <select id="goal-freq" bind:value={editorFreq}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="YEARLY">Yearly</option>
                            </select>
                        </div>

                        {#if editorFreq === 'WEEKLY'}
                            <div class="mb-3">
                                <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1" for="goal-byday">On</label>
                                <select id="goal-byday" bind:value={editorByDay}
                                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    {#each DAYS as day}
                                        <option value={day}>{DAY_LABELS[day]}</option>
                                    {/each}
                                </select>
                            </div>
                        {/if}

                        {#if editorFreq === 'MONTHLY'}
                            <div class="mb-3">
                                <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1" for="goal-bymonthday">On the</label>
                                <select id="goal-bymonthday" bind:value={editorByMonthDay}
                                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    {#each Array.from({length: 28}, (_, i) => i + 1) as day}
                                        <option value={day}>{day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}</option>
                                    {/each}
                                </select>
                            </div>
                        {/if}

                        {#if editorFreq === 'YEARLY'}
                            <div class="grid grid-cols-2 gap-2 mb-3">
                                <div>
                                    <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1" for="goal-bymonth">Month</label>
                                    <select id="goal-bymonth" bind:value={editorByMonth}
                                        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                        {#each ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as month, i}
                                            <option value={i + 1}>{month}</option>
                                        {/each}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1" for="goal-bymday-yr">Day</label>
                                    <select id="goal-bymday-yr" bind:value={editorByMonthDay}
                                        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                        {#each Array.from({length: 28}, (_, i) => i + 1) as day}
                                            <option value={day}>{day}</option>
                                        {/each}
                                    </select>
                                </div>
                            </div>
                        {/if}

                        <!-- Hidden fields for rrule + dtstart -->
                        <input type="hidden" name="rrule"   value={derivedRrule} />
                        <input type="hidden" name="dtstart" value={derivedDtstart} />

                        <!-- RRULE hint -->
                        <p class="text-xs text-indigo-400 font-mono mb-3 bg-indigo-50 rounded px-2 py-1">
                            {derivedRrule}
                        </p>
                    {/if}

                    {#if editorType === 'one_off'}
                        <div class="mb-3">
                            <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1" for="goal-due-date">Save by</label>
                            <input
                                id="goal-due-date"
                                name="due_date"
                                type="date"
                                bind:value={editorDueDate}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                    {/if}

                    <div class="flex gap-2 mt-2">
                        <button type="submit"
                            class="flex-1 bg-indigo-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-700">
                            Save goal
                        </button>
                        <button type="button" onclick={() => showGoalEditor = false}
                            class="flex-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-200">
                            Cancel
                        </button>
                    </div>
                </form>
            {/if}
        </div>

        <!-- Allocations placeholder -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm opacity-50">
            <p class="text-xs uppercase tracking-wide text-gray-400 font-medium mb-2">Allocations</p>
            <p class="text-sm text-gray-400">Transaction history coming soon.</p>
        </div>

    </main>
</div>
