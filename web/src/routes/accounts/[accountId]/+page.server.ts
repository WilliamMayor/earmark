import { error, fail, redirect } from '@sveltejs/kit';
import {
	getAccount,
	getEnvelopes,
	getUnallocatedTransactions,
	createEnvelope,
	allocateSplit,
	getSplitsWithStatus,
	setAccountRoundUp,
	createSplit,
	deleteSplit
} from '$lib/queries.js';
import { AlreadyAllocatedError, SplitValidationError } from '$lib/types.js';

export function load({ params, url }) {
	const accountId = parseInt(params.accountId, 10);

	const account = getAccount(accountId);
	if (!account) error(404, 'Account not found');

	const envelopes = getEnvelopes(accountId);
	const unallocated = getUnallocatedTransactions(accountId);
	const mode = unallocated.length > 0 ? 'allocate' : 'clean';

	const txParam = url.searchParams.get('tx');
	const rawIndex = txParam !== null ? parseInt(txParam, 10) : 0;
	const currentTxIndex =
		unallocated.length > 0 ? Math.max(0, Math.min(rawIndex, unallocated.length - 1)) : 0;

	// Load splits for the current transaction so the dock can show split parts
	const currentTx = unallocated[currentTxIndex] ?? null;
	const currentSplits = currentTx ? getSplitsWithStatus(currentTx.id) : [];

	return { account, envelopes, unallocated, mode, currentTxIndex, currentTx, currentSplits };
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

		// Work out where to redirect: stay at same index (now points to next tx)
		const unallocated = getUnallocatedTransactions(accountId);
		const nextIndex = Math.min(currentIndex, Math.max(0, unallocated.length - 1));
		redirect(303, `/accounts/${accountId}?tx=${nextIndex}`);
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
