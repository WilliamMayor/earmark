import { error, fail, redirect } from '@sveltejs/kit';
import {
    getAccount,
    getEnvelopes,
    getUnallocatedTransactions,
    getUnallocatedWithdrawals,
    createEnvelope,
    allocateSplit,
    allocateWithdrawal,
    createWithdrawal,
    getSplitsWithStatus,
    setAccountRoundUp,
    createSplit,
    deleteSplit
} from '$lib/queries.js';
import {
    AlreadyAllocatedError,
    SplitValidationError,
    WithdrawalAlreadyAllocatedError,
    type EnvelopeWithdrawal,
    type SplitWithStatus,
    type Transaction
} from '$lib/types.js';

export type QueueItem =
    | { kind: 'withdrawal'; withdrawal: EnvelopeWithdrawal }
    | { kind: 'transaction'; tx: Transaction; splits: SplitWithStatus[] };

export function load({ params, url }) {
    const accountId = parseInt(params.accountId, 10);

    const account = getAccount(accountId);
    if (!account) error(404, 'Account not found');

    const envelopes = getEnvelopes(accountId);

    const unallocatedWithdrawals = getUnallocatedWithdrawals(accountId);
    const unallocatedTransactions = getUnallocatedTransactions(accountId);

    const queue: QueueItem[] = [
        ...unallocatedWithdrawals.map((w): QueueItem => ({ kind: 'withdrawal', withdrawal: w })),
        ...unallocatedTransactions.map((tx): QueueItem => ({ kind: 'transaction', tx, splits: [] }))
    ];

    const mode = queue.length > 0 ? 'allocate' : 'clean';

    const txParam = url.searchParams.get('tx');
    const rawIndex = txParam !== null ? parseInt(txParam, 10) : 0;
    const currentItemIndex = queue.length > 0 ? Math.max(0, Math.min(rawIndex, queue.length - 1)) : 0;

    let currentItem: QueueItem | null = queue[currentItemIndex] ?? null;
    if (currentItem?.kind === 'transaction') {
        currentItem = {
            kind: 'transaction',
            tx: currentItem.tx,
            splits: getSplitsWithStatus(currentItem.tx.id)
        };
    }

    return { account, envelopes, queue, mode, currentItemIndex, currentItem };
}

export const actions = {
    allocate: async ({ request, params }) => {
        const accountId = parseInt(params.accountId, 10);
        const data = await request.formData();
        const envelopeId = parseInt(data.get('envelope_id') as string, 10);
        const splitId = parseInt(data.get('split_id') as string, 10);
        const currentIndex = parseInt((data.get('current_index') as string) ?? '0', 10);

        if (isNaN(envelopeId) || isNaN(splitId)) return fail(400, { error: 'Invalid input' });

        try {
            allocateSplit(envelopeId, splitId);
        } catch (err) {
            if (err instanceof AlreadyAllocatedError) return fail(409, { error: err.message });
            throw err;
        }

        const total = getUnallocatedWithdrawals(accountId).length + getUnallocatedTransactions(accountId).length;
        const nextIndex = Math.min(currentIndex, Math.max(0, total - 1));
        redirect(303, `/accounts/${accountId}?tx=${nextIndex}`);
    },

    allocate_withdrawal: async ({ request, params }) => {
        const accountId = parseInt(params.accountId, 10);
        const data = await request.formData();
        const withdrawalId = parseInt(data.get('withdrawal_id') as string, 10);
        const envelopeId = parseInt(data.get('envelope_id') as string, 10);
        const currentIndex = parseInt((data.get('current_index') as string) ?? '0', 10);

        if (isNaN(withdrawalId) || isNaN(envelopeId)) return fail(400, { error: 'Invalid input' });

        try {
            allocateWithdrawal(withdrawalId, envelopeId);
        } catch (err) {
            if (err instanceof WithdrawalAlreadyAllocatedError) return fail(409, { error: err.message });
            throw err;
        }

        const total = getUnallocatedWithdrawals(accountId).length + getUnallocatedTransactions(accountId).length;
        const nextIndex = Math.min(currentIndex, Math.max(0, total - 1));
        redirect(303, `/accounts/${accountId}?tx=${nextIndex}`);
    },

    withdraw: async ({ request, params }) => {
        const accountId = parseInt(params.accountId, 10);
        const data = await request.formData();
        const envelopeId = parseInt(data.get('envelope_id') as string, 10);
        const amount = (data.get('amount') as string)?.trim();
        const note = (data.get('note') as string)?.trim() || null;

        if (isNaN(envelopeId) || !amount) return fail(400, { error: 'Invalid input' });

        try {
            createWithdrawal(envelopeId, amount, note);
        } catch (err) {
            if (err instanceof SplitValidationError) return fail(422, { error: err.message });
            throw err;
        }

        redirect(303, `/accounts/${accountId}?tx=0`);
    },

    create_envelope: async ({ request, params }) => {
        const accountId = parseInt(params.accountId, 10);
        const data = await request.formData();
        const name = (data.get('name') as string)?.trim();

        if (!name) return fail(400, { error: 'Envelope name is required' });

        try {
            createEnvelope(accountId, name);
        } catch (err) {
            const e = err as { code?: string };
            if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return fail(409, { error: `An envelope named "${name}" already exists` });
            }
            throw err;
        }

        redirect(303, `/accounts/${accountId}`);
    },

    toggle_round_up: async ({ request, params }) => {
        const accountId = parseInt(params.accountId, 10);
        const data = await request.formData();
        const enabled = data.get('enabled') === '1';
        const since = enabled ? new Date().toISOString().slice(0, 10) : null;
        setAccountRoundUp(accountId, since);
        redirect(303, `/accounts/${accountId}`);
    },

    create_split: async ({ request, params }) => {
        const accountId = parseInt(params.accountId, 10);
        const data = await request.formData();
        const txId = parseInt(data.get('tx_id') as string, 10);
        const amount = (data.get('amount') as string)?.trim();
        const note = (data.get('note') as string)?.trim() || null;
        const currentIndex = parseInt((data.get('current_index') as string) ?? '0', 10);

        if (isNaN(txId) || !amount) return fail(400, { error: 'Invalid input' });

        try {
            createSplit(txId, amount, note);
        } catch (err) {
            if (err instanceof SplitValidationError) return fail(422, { error: err.message });
            throw err;
        }

        redirect(303, `/accounts/${accountId}?tx=${currentIndex}`);
    },

    delete_split: async ({ request, params }) => {
        const accountId = parseInt(params.accountId, 10);
        const data = await request.formData();
        const splitId = parseInt(data.get('split_id') as string, 10);
        const currentIndex = parseInt((data.get('current_index') as string) ?? '0', 10);

        if (isNaN(splitId)) return fail(400, { error: 'Invalid input' });

        try {
            deleteSplit(splitId);
        } catch (err) {
            if (err instanceof SplitValidationError) return fail(422, { error: err.message });
            throw err;
        }

        redirect(303, `/accounts/${accountId}?tx=${currentIndex}`);
    }
};
