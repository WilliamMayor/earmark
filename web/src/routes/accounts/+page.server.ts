import { fail } from '@sveltejs/kit';
import { getAccounts } from '$lib/queries.js';

export function load() {
	const accounts = getAccounts();
	return { accounts };
}

export const actions = {
	sync: async () => {
		try {
			const response = await fetch('http://sync:8080/sync', {
				method: 'POST',
				signal: AbortSignal.timeout(300_000),
			});
			if (!response.ok) {
				const body = await response.json();
				return fail(500, { synced: false as const, error: body.detail ?? 'Sync failed' });
			}
			const result = await response.json();
			return {
				synced: true as const,
				total: result.total_upserted as number,
				accounts: result.accounts_synced as number,
				errors: result.errors as string[],
			};
		} catch {
			return fail(503, { synced: false as const, error: 'Sync service unavailable' });
		}
	},
};
