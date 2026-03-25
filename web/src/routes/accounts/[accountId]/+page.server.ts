import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';
import {
	getEnvelopes,
	getUnallocatedTransactions,
	createEnvelope,
	renameEnvelope,
	deleteEnvelope,
	allocateSplit,
	getSplitsWithStatus
} from '$lib/queries.js';
import { AlreadyAllocatedError, EnvelopeHasAllocationsError } from '$lib/types.js';

export function load({ params, url }) {
	const accountId = parseInt(params.accountId, 10);

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

	return { envelopes, unallocated, mode, currentTxIndex, currentTx, currentSplits };
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

		// If the transaction still has unallocated splits, return to the split page
		const db = getDb();
		const row = db.prepare(`SELECT transaction_id FROM splits WHERE id = ?`).get(splitId) as { transaction_id: number } | null;
		if (row) {
			const remaining = getSplitsWithStatus(row.transaction_id, db);
			if (remaining.some((s) => !s.is_allocated)) {
				redirect(303, `/accounts/${accountId}/split?tx=${row.transaction_id}`);
			}
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
