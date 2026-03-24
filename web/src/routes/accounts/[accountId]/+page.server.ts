import { fail, redirect } from '@sveltejs/kit';
import {
	getEnvelopes,
	getUnallocatedTransactions,
	getUnallocatedWithdrawals,
	createEnvelope,
	renameEnvelope,
	deleteEnvelope,
	allocateSplit,
	allocateWithdrawal,
	createWithdrawal,
	getSplitsWithStatus
} from '$lib/queries.js';
import {
	AlreadyAllocatedError,
	EnvelopeHasAllocationsError,
	WithdrawalValidationError
} from '$lib/types.js';
import { toMinorUnits } from '$lib/format.js';

export function load({ params, url }) {
	const accountId = parseInt(params.accountId, 10);

	const envelopes = getEnvelopes(accountId);
	const unallocatedTransactions = getUnallocatedTransactions(accountId);
	const unallocatedWithdrawals = getUnallocatedWithdrawals(accountId);

	// Unified queue: pending withdrawals first, then transactions
	const queue = [
		...unallocatedWithdrawals.map((w) => ({ kind: 'withdrawal' as const, withdrawal: w })),
		...unallocatedTransactions.map((tx) => ({ kind: 'transaction' as const, tx }))
	];

	const mode = queue.length > 0 ? 'allocate' : 'clean';

	const txParam = url.searchParams.get('tx');
	const rawIndex = txParam !== null ? parseInt(txParam, 10) : 0;
	const currentIndex = queue.length > 0 ? Math.max(0, Math.min(rawIndex, queue.length - 1)) : 0;
	const currentItem = queue[currentIndex] ?? null;

	// Load splits only for the current item if it's a transaction
	const currentSplits =
		currentItem?.kind === 'transaction' ? getSplitsWithStatus(currentItem.tx.id) : [];

	return { envelopes, queue, mode, currentIndex, currentItem, currentSplits };
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

		const unallocatedTransactions = getUnallocatedTransactions(accountId);
		const unallocatedWithdrawals = getUnallocatedWithdrawals(accountId);
		const queueLength = unallocatedWithdrawals.length + unallocatedTransactions.length;
		const nextIndex = Math.min(currentIndex, Math.max(0, queueLength - 1));
		redirect(303, `/accounts/${accountId}?tx=${nextIndex}`);
	},

	allocate_withdrawal: async ({ request, params }) => {
		const accountId = parseInt(params.accountId, 10);
		const data = await request.formData();
		const envelopeId = parseInt(data.get('envelope_id') as string, 10);
		const withdrawalId = parseInt(data.get('withdrawal_id') as string, 10);
		const currentIndex = parseInt((data.get('current_index') as string) ?? '0', 10);

		if (isNaN(envelopeId) || isNaN(withdrawalId)) return fail(400, { error: 'Invalid input' });

		try {
			allocateWithdrawal(withdrawalId, envelopeId);
		} catch (err) {
			if (err instanceof WithdrawalValidationError) return fail(400, { error: err.message });
			throw err;
		}

		const unallocatedTransactions = getUnallocatedTransactions(accountId);
		const unallocatedWithdrawals = getUnallocatedWithdrawals(accountId);
		const queueLength = unallocatedWithdrawals.length + unallocatedTransactions.length;
		const nextIndex = Math.min(currentIndex, Math.max(0, queueLength - 1));
		redirect(303, `/accounts/${accountId}?tx=${nextIndex}`);
	},

	create_withdrawal: async ({ request, params }) => {
		const accountId = parseInt(params.accountId, 10);
		const data = await request.formData();
		const fromEnvelopeId = parseInt(data.get('from_envelope_id') as string, 10);
		const amountStr = (data.get('amount') as string)?.trim();
		const note = (data.get('note') as string)?.trim() || null;

		if (isNaN(fromEnvelopeId)) return fail(400, { error: 'Invalid envelope' });
		if (!amountStr) return fail(400, { error: 'Amount is required' });

		const minor = toMinorUnits(amountStr);
		if (isNaN(minor) || minor <= 0) return fail(400, { error: 'Amount must be a positive number' });

		try {
			createWithdrawal(accountId, fromEnvelopeId, amountStr, note);
		} catch (err) {
			if (err instanceof WithdrawalValidationError) return fail(400, { error: err.message });
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

	rename_envelope: async ({ request, params }) => {
		const accountId = parseInt(params.accountId, 10);
		const data = await request.formData();
		const envelopeId = parseInt(data.get('envelope_id') as string, 10);
		const name = (data.get('name') as string)?.trim();

		if (!name) return fail(400, { error: 'Envelope name is required' });
		if (isNaN(envelopeId)) return fail(400, { error: 'Invalid envelope' });

		renameEnvelope(envelopeId, name);
		redirect(303, `/accounts/${accountId}`);
	},

	delete_envelope: async ({ request, params }) => {
		const accountId = parseInt(params.accountId, 10);
		const data = await request.formData();
		const envelopeId = parseInt(data.get('envelope_id') as string, 10);

		if (isNaN(envelopeId)) return fail(400, { error: 'Invalid envelope' });

		try {
			deleteEnvelope(envelopeId);
		} catch (err) {
			if (err instanceof EnvelopeHasAllocationsError) {
				return fail(409, { error: err.message });
			}
			throw err;
		}

		redirect(303, `/accounts/${accountId}`);
	}
};
