import { error } from '@sveltejs/kit';
import { getAccount } from '$lib/queries.js';

export function load({ params }) {
	const id = parseInt(params.accountId, 10);
	if (isNaN(id)) error(404, 'Account not found');

	const account = getAccount(id);
	if (!account) error(404, 'Account not found');

	return { account };
}
