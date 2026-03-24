import { getAccounts } from '$lib/queries.js';

export function load() {
	const accounts = getAccounts();
	return { accounts };
}
