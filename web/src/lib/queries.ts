import type Database from 'better-sqlite3';
import { getDb, withRetry } from './db.js';
import {
	AlreadyAllocatedError,
	EnvelopeHasAllocationsError,
	type AccountWithStats,
	type EnvelopeWithStats,
	type Split,
	type SplitWithStatus,
	type Transaction
} from './types.js';

export const ROUND_UP_ENVELOPE_NAME = 'Round Up';

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function getAccounts(db: Database.Database = getDb()): AccountWithStats[] {
	return db
		.prepare(
			`
		SELECT
			a.*,
			COUNT(CASE
				WHEN t.credit_debit_indicator = 'DBIT'
				AND  t.status IN ('booked', 'pending')
				AND  EXISTS (SELECT 1 FROM splits s WHERE s.transaction_id = t.id AND s.is_round_up = 0)
				AND  NOT EXISTS (
					SELECT 1 FROM splits s2
					WHERE s2.transaction_id = t.id
					AND s2.is_round_up = 0
					AND NOT EXISTS (SELECT 1 FROM allocations al WHERE al.split_id = s2.id)
				)
				THEN NULL
				WHEN t.credit_debit_indicator = 'DBIT'
				AND  t.status IN ('booked', 'pending')
				THEN 1
			END) AS unallocated_count
		FROM accounts a
		LEFT JOIN transactions t ON t.account_id = a.id
		GROUP BY a.id
		ORDER BY a.institution_name, a.name
	`
		)
		.all() as AccountWithStats[];
}

export function getAccount(
	id: number,
	db: Database.Database = getDb()
): AccountWithStats | null {
	return (
		(db
			.prepare(
				`
		SELECT
			a.*,
			COUNT(CASE
				WHEN t.credit_debit_indicator = 'DBIT'
				AND  t.status IN ('booked', 'pending')
				AND  EXISTS (SELECT 1 FROM splits s WHERE s.transaction_id = t.id AND s.is_round_up = 0)
				AND  NOT EXISTS (
					SELECT 1 FROM splits s2
					WHERE s2.transaction_id = t.id
					AND s2.is_round_up = 0
					AND NOT EXISTS (SELECT 1 FROM allocations al WHERE al.split_id = s2.id)
				)
				THEN NULL
				WHEN t.credit_debit_indicator = 'DBIT'
				AND  t.status IN ('booked', 'pending')
				THEN 1
			END) AS unallocated_count
		FROM accounts a
		LEFT JOIN transactions t ON t.account_id = a.id
		WHERE a.id = ?
		GROUP BY a.id
	`
			)
			.get(id) as AccountWithStats | null) ?? null
	);
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

export function getEnvelopes(
	accountId: number,
	db: Database.Database = getDb()
): EnvelopeWithStats[] {
	const totalSpend = getTotalSpend(accountId, db);

	const rows = db
		.prepare(
			`
		SELECT
			e.*,
			COALESCE(SUM(
				CASE WHEN t.credit_debit_indicator = 'DBIT' THEN CAST(s.amount AS REAL) ELSE 0 END
			), 0) AS allocated_raw
		FROM envelopes e
		LEFT JOIN allocations al ON al.envelope_id = e.id
		LEFT JOIN splits s ON s.id = al.split_id
		LEFT JOIN transactions t ON t.id = s.transaction_id
		WHERE e.account_id = ?
		GROUP BY e.id
		ORDER BY e.sort_order, e.name
	`
		)
		.all(accountId) as Array<Omit<EnvelopeWithStats, 'allocated_total' | 'percent_of_total'> & { allocated_raw: number }>;

	return rows.map((row) => ({
		...row,
		allocated_total: row.allocated_raw.toFixed(2),
		percent_of_total: totalSpend > 0 ? Math.min((row.allocated_raw / totalSpend) * 100, 100) : 0
	}));
}

export function getTotalSpend(accountId: number, db: Database.Database = getDb()): number {
	const row = db
		.prepare(
			`
		SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS total
		FROM transactions
		WHERE account_id = ?
		  AND credit_debit_indicator = 'DBIT'
		  AND status IN ('booked', 'pending')
	`
		)
		.get(accountId) as { total: number };
	return row.total;
}

export function createEnvelope(
	accountId: number,
	name: string,
	db: Database.Database = getDb()
): number {
	const result = db
		.prepare(`INSERT INTO envelopes (account_id, name) VALUES (?, ?)`)
		.run(accountId, name.trim());
	return result.lastInsertRowid as number;
}

/**
 * Returns the id of the "Round Up" envelope for the account, creating it if needed.
 */
function getOrCreateRoundUpEnvelope(
	accountId: number,
	db: Database.Database = getDb()
): number {
	const existing = db
		.prepare(`SELECT id FROM envelopes WHERE account_id = ? AND name = ?`)
		.get(accountId, ROUND_UP_ENVELOPE_NAME) as { id: number } | null;
	if (existing) return existing.id;

	const result = db
		.prepare(`INSERT INTO envelopes (account_id, name) VALUES (?, ?)`)
		.run(accountId, ROUND_UP_ENVELOPE_NAME);
	return result.lastInsertRowid as number;
}

export function renameEnvelope(
	envelopeId: number,
	name: string,
	db: Database.Database = getDb()
): void {
	db.prepare(`UPDATE envelopes SET name = ? WHERE id = ?`).run(name.trim(), envelopeId);
}

export function deleteEnvelope(
	envelopeId: number,
	db: Database.Database = getDb()
): void {
	const hasAllocations = db
		.prepare(`SELECT 1 FROM allocations WHERE envelope_id = ? LIMIT 1`)
		.get(envelopeId);
	if (hasAllocations) throw new EnvelopeHasAllocationsError(envelopeId);
	db.prepare(`DELETE FROM envelopes WHERE id = ?`).run(envelopeId);
}

// ---------------------------------------------------------------------------
// Splits
// ---------------------------------------------------------------------------

/**
 * Enable or disable the round-up feature on an account.
 * When enabling, ensures a "Round Up" envelope exists and back-fills round-up
 * splits for any currently unallocated DBIT transactions.
 */
export function setAccountRoundUp(
	accountId: number,
	enabled: boolean,
	db: Database.Database = getDb()
): void {
	db.prepare(`UPDATE accounts SET round_up = ? WHERE id = ?`).run(enabled ? 1 : 0, accountId);

	if (enabled) {
		getOrCreateRoundUpEnvelope(accountId, db);
	}
}

export function getSplitsWithStatus(
	transactionId: number,
	db: Database.Database = getDb()
): SplitWithStatus[] {
	return db
		.prepare(
			`
		SELECT
			s.*,
			CASE WHEN al.id IS NOT NULL THEN 1 ELSE 0 END AS is_allocated,
			al.envelope_id,
			e.name AS envelope_name
		FROM splits s
		LEFT JOIN allocations al ON al.split_id = s.id
		LEFT JOIN envelopes e ON e.id = al.envelope_id
		WHERE s.transaction_id = ? AND s.is_round_up = 0
		ORDER BY s.sort_order
	`
		)
		.all(transactionId)
		.map((row: Record<string, unknown>) => ({
			...(row as Split),
			is_allocated: (row.is_allocated as number) === 1,
			is_round_up: false,
			envelope_id: (row.envelope_id as number | null) ?? null,
			envelope_name: (row.envelope_name as string | null) ?? null
		})) as SplitWithStatus[];
}

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

export function allocateSplit(
	envelopeId: number,
	splitId: number,
	db: Database.Database = getDb()
): void {
	try {
		withRetry(() =>
			db
				.prepare(`INSERT INTO allocations (envelope_id, split_id) VALUES (?, ?)`)
				.run(envelopeId, splitId)
		);
	} catch (err) {
		const e = err as { code?: string };
		if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
			throw new AlreadyAllocatedError(splitId);
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Unallocated transaction queue
// ---------------------------------------------------------------------------

export function getUnallocatedTransactions(
	accountId: number,
	db: Database.Database = getDb()
): Transaction[] {
	const txs = db
		.prepare(
			`
		SELECT t.*
		FROM transactions t
		WHERE t.account_id = ?
		  AND t.credit_debit_indicator = 'DBIT'
		  AND t.status IN ('booked', 'pending')
		  AND NOT (
		      EXISTS (SELECT 1 FROM splits s WHERE s.transaction_id = t.id AND s.is_round_up = 0)
		      AND NOT EXISTS (
		          SELECT 1 FROM splits s2
		          WHERE s2.transaction_id = t.id
		          AND s2.is_round_up = 0
		          AND NOT EXISTS (SELECT 1 FROM allocations al WHERE al.split_id = s2.id)
		      )
		  )
		ORDER BY t.date ASC, t.id ASC
	`
		)
		.all(accountId) as Transaction[];

	return txs;
}
