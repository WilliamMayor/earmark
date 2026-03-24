import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';
import { getSplitsWithStatus, saveSplits, resetSplits, getUnallocatedTransactions } from '$lib/queries.js';
import { SplitValidationError } from '$lib/types.js';

export function load({ params, url }) {
	const accountId = parseInt(params.accountId, 10);
	const txId = parseInt(url.searchParams.get('tx') ?? '', 10);
	if (isNaN(txId)) error(400, 'Missing transaction id');

	const db = getDb();
	const tx = db
		.prepare(
			`SELECT * FROM transactions WHERE id = ? AND account_id = ? AND credit_debit_indicator = 'DBIT'`
		)
		.get(txId, accountId) as
		| {
				id: number;
				account_id: number;
				booking_date: string | null;
				amount: string;
				currency: string;
				credit_debit_indicator: string;
				status: string;
				payee: string | null;
				remittance_information: string | null;
				note: string | null;
		  }
		| undefined;

	if (!tx) error(404, 'Transaction not found');

	const splits = getSplitsWithStatus(txId);
	// 'define' if only one split (the default), 'allocate' if user has already defined parts
	const mode = splits.length > 1 ? 'allocate' : 'define';

	return { transaction: tx, splits, mode };
}

export const actions = {
	save_splits: async ({ request, params, url }) => {
		const accountId = parseInt(params.accountId, 10);
		const txId = parseInt(url.searchParams.get('tx') ?? '', 10);
		if (isNaN(txId)) return fail(400, { error: 'Missing transaction id' });

		const data = await request.formData();
		const amounts = data.getAll('amount') as string[];
		const notes = data.getAll('note') as string[];

		const parts = amounts.map((amount, i) => ({
			amount: amount.trim(),
			note: notes[i]?.trim() || undefined
		}));

		try {
			saveSplits(txId, parts);
		} catch (err) {
			if (err instanceof SplitValidationError) {
				return fail(422, { error: err.message });
			}
			throw err;
		}

		redirect(303, `/accounts/${accountId}/split?tx=${txId}`);
	},

	cancel: async ({ params, url }) => {
		const accountId = parseInt(params.accountId, 10);
		const txId = parseInt(url.searchParams.get('tx') ?? '', 10);
		if (isNaN(txId)) redirect(303, `/accounts/${accountId}`);

		resetSplits(txId);

		// Find the index of this transaction in the unallocated list to return to the right dock position
		const unallocated = getUnallocatedTransactions(accountId);
		const index = unallocated.findIndex((t) => t.id === txId);
		const txIndex = index >= 0 ? index : 0;

		redirect(303, `/accounts/${accountId}?tx=${txIndex}`);
	}
};
