import { fail, redirect } from '@sveltejs/kit';
import { getTransactions, createTransaction } from '$lib/queries.js';
import { TransactionValidationError } from '$lib/types.js';

export function load({ params }) {
	const accountId = parseInt(params.accountId, 10);
	const transactions = getTransactions(accountId);
	return { transactions };
}

export const actions = {
	add_transaction: async ({ request, params }) => {
		const accountId = parseInt(params.accountId, 10);
		const data = await request.formData();
		const amount = (data.get('amount') as string)?.trim();
		const description = (data.get('description') as string)?.trim();
		const merchant = (data.get('merchant') as string)?.trim() || null;
		const date = (data.get('date') as string)?.trim() || null;

		if (!amount) return fail(400, { error: 'Amount is required' });
		if (!description) return fail(400, { error: 'Description is required' });

		try {
			createTransaction(accountId, amount, description, date, merchant);
		} catch (err) {
			if (err instanceof TransactionValidationError) return fail(422, { error: err.message });
			throw err;
		}

		redirect(303, `/accounts/${accountId}/transactions`);
	}
};
