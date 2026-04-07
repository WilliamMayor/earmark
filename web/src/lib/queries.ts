import type Database from 'better-sqlite3';
import { getDb, withRetry } from './db.js';
import {
	AlreadyAllocatedError,
	EnvelopeHasAllocationsError,
	SplitValidationError,
	type AccountWithStats,
	type EnvelopeWithStats,
	type Split,
	type SplitWithStatus,
	type Transaction
} from './types.js';
import { toMinorUnits, fromMinorUnits } from './format.js';

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
				WHEN (
					(t.credit_debit_indicator IN ('DBIT', 'CRDT') AND t.status IN ('booked', 'pending'))
					OR t.status = 'opening_balance'
				)
				AND  EXISTS (SELECT 1 FROM splits s WHERE s.transaction_id = t.id AND s.is_round_up = 0)
				AND  NOT EXISTS (
					SELECT 1 FROM splits s2
					WHERE s2.transaction_id = t.id
					AND s2.is_round_up = 0
					AND NOT EXISTS (SELECT 1 FROM allocations al WHERE al.split_id = s2.id)
				)
				THEN NULL
				WHEN (
					(t.credit_debit_indicator IN ('DBIT', 'CRDT') AND t.status IN ('booked', 'pending'))
					OR t.status = 'opening_balance'
				)
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
				WHEN (
					(t.credit_debit_indicator IN ('DBIT', 'CRDT') AND t.status IN ('booked', 'pending'))
					OR t.status = 'opening_balance'
				)
				AND  EXISTS (SELECT 1 FROM splits s WHERE s.transaction_id = t.id AND s.is_round_up = 0)
				AND  NOT EXISTS (
					SELECT 1 FROM splits s2
					WHERE s2.transaction_id = t.id
					AND s2.is_round_up = 0
					AND NOT EXISTS (SELECT 1 FROM allocations al WHERE al.split_id = s2.id)
				)
				THEN NULL
				WHEN (
					(t.credit_debit_indicator IN ('DBIT', 'CRDT') AND t.status IN ('booked', 'pending'))
					OR t.status = 'opening_balance'
				)
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
			), 0) AS allocated_raw,
			-- goal_balance: net of all allocated splits (CRDT adds, DBIT subtracts).
			-- No status filter — intentionally consistent with allocated_raw.
			COALESCE(SUM(
				CASE
					WHEN t.credit_debit_indicator = 'CRDT' THEN CAST(s.amount AS REAL)
					WHEN t.credit_debit_indicator = 'DBIT' THEN -CAST(s.amount AS REAL)
					ELSE 0
				END
			), 0) AS goal_balance
		FROM envelopes e
		LEFT JOIN allocations al ON al.envelope_id = e.id
		LEFT JOIN splits s ON s.id = al.split_id
		LEFT JOIN transactions t ON t.id = s.transaction_id
		WHERE e.account_id = ?
		GROUP BY e.id
		ORDER BY e.sort_order, e.name
	`
		)
		.all(accountId) as Array<
			Omit<EnvelopeWithStats, 'allocated_total' | 'percent_of_total'> & { allocated_raw: number; goal_balance: number }
		>;

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

export function getEnvelope(
	envelopeId: number,
	db: Database.Database = getDb()
): EnvelopeWithStats | null {
	const row = db
		.prepare(
			`
		SELECT
			e.*,
			COALESCE(SUM(
				CASE WHEN t.credit_debit_indicator = 'DBIT' THEN CAST(s.amount AS REAL) ELSE 0 END
			), 0) AS allocated_raw,
			-- goal_balance: net of all allocated splits (CRDT adds, DBIT subtracts).
			-- No status filter — intentionally consistent with allocated_raw.
			COALESCE(SUM(
				CASE
					WHEN t.credit_debit_indicator = 'CRDT' THEN CAST(s.amount AS REAL)
					WHEN t.credit_debit_indicator = 'DBIT' THEN -CAST(s.amount AS REAL)
					ELSE 0
				END
			), 0) AS goal_balance
		FROM envelopes e
		LEFT JOIN allocations al ON al.envelope_id = e.id
		LEFT JOIN splits s ON s.id = al.split_id
		LEFT JOIN transactions t ON t.id = s.transaction_id
		WHERE e.id = ?
		GROUP BY e.id
	`
		)
		.get(envelopeId) as
		| (Omit<EnvelopeWithStats, 'allocated_total' | 'percent_of_total'> & {
				allocated_raw: number;
				goal_balance: number;
		  })
		| null;

	if (!row) return null;

	const accountId = row.account_id;
	const totalSpend = getTotalSpend(accountId, db);

	return {
		...row,
		allocated_total: row.allocated_raw.toFixed(2),
		percent_of_total: totalSpend > 0 ? Math.min((row.allocated_raw / totalSpend) * 100, 100) : 0
	};
}

export interface GoalParams {
	amount: string;
	rrule:   string | null;
	dtstart: string | null;
	dueDate: string | null;
}

export function setGoal(
	envelopeId: number,
	params: GoalParams,
	db: Database.Database = getDb()
): void {
	const existing = db
		.prepare(`SELECT goal_created_at FROM envelopes WHERE id = ?`)
		.get(envelopeId) as { goal_created_at: string | null } | null;

	// goal_created_at is write-once: preserve it if it already exists
	const createdAt = existing?.goal_created_at ?? new Date().toISOString().slice(0, 10);

	db.prepare(
		`UPDATE envelopes
		 SET goal_amount = ?, goal_rrule = ?, goal_dtstart = ?, goal_due_date = ?, goal_created_at = ?
		 WHERE id = ?`
	).run(params.amount, params.rrule, params.dtstart, params.dueDate, createdAt, envelopeId);
}

export function removeGoal(
	envelopeId: number,
	db: Database.Database = getDb()
): void {
	db.prepare(
		`UPDATE envelopes
		 SET goal_amount = NULL, goal_rrule = NULL, goal_dtstart = NULL,
		     goal_due_date = NULL, goal_created_at = NULL
		 WHERE id = ?`
	).run(envelopeId);
}

export function getGoalContribution(
	envelopeId: number,
	since: string,
	db: Database.Database = getDb()
): number {
	// No status filter on transactions — intentionally consistent with allocated_raw.
	const row = db
		.prepare(
			`
		SELECT COALESCE(SUM(
			CASE
				WHEN t.credit_debit_indicator = 'CRDT' THEN CAST(s.amount AS REAL)
				WHEN t.credit_debit_indicator = 'DBIT' THEN -CAST(s.amount AS REAL)
				ELSE 0
			END
		), 0) AS net_contributed
		FROM allocations al
		JOIN splits s ON s.id = al.split_id
		JOIN transactions t ON t.id = s.transaction_id
		WHERE al.envelope_id = ?
		  AND t.date >= ?
	`
		)
		.get(envelopeId, since) as { net_contributed: number };
	return row.net_contributed;
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
	since: string | null,
	db: Database.Database = getDb()
): void {
	db.prepare(`UPDATE accounts SET round_up_since = ? WHERE id = ?`).run(since, accountId);

	if (since !== null) {
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
		.map((row: unknown) => {
			const r = row as Record<string, unknown>;
			return {
				...(r as unknown as Split),
				is_default: Boolean(r.is_default),
				is_round_up: Boolean(r.is_round_up),
				is_allocated: (r.is_allocated as number) === 1,
				envelope_id: (r.envelope_id as number | null) ?? null,
				envelope_name: (r.envelope_name as string | null) ?? null
			};
		}) as SplitWithStatus[];
}

export function createSplit(
	txId: number,
	amount: string,
	note: string | null,
	db: Database.Database = getDb()
): Split {
	const defaultSplit = db
		.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_default = 1`)
		.get(txId) as Split | undefined;

	if (!defaultSplit) {
		throw new SplitValidationError(`No default split found for transaction ${txId}`);
	}

	const amountMinor = toMinorUnits(amount);
	const defaultMinor = toMinorUnits(defaultSplit.amount);

	if (amountMinor <= 0) {
		throw new SplitValidationError('Split amount must be greater than 0');
	}
	if (amountMinor >= defaultMinor) {
		throw new SplitValidationError('Split amount must be less than the default split amount');
	}

	const newDefaultMinor = defaultMinor - amountMinor;
	db.prepare(`UPDATE splits SET amount = ? WHERE id = ?`).run(
		fromMinorUnits(newDefaultMinor),
		defaultSplit.id
	);

	const maxOrder = db
		.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM splits WHERE transaction_id = ?`)
		.get(txId) as { max_order: number };
	const sortOrder = maxOrder.max_order + 1;

	const result = db
		.prepare(
			`INSERT INTO splits (transaction_id, amount, note, sort_order, is_default, is_round_up)
			 VALUES (?, ?, ?, ?, 0, 0)`
		)
		.run(txId, amount, note, sortOrder);

	return db
		.prepare(`SELECT * FROM splits WHERE id = ?`)
		.get(result.lastInsertRowid) as Split;
}

export function deleteSplit(splitId: number, db: Database.Database = getDb()): void {
	const split = db.prepare(`SELECT * FROM splits WHERE id = ?`).get(splitId) as Split | undefined;

	if (!split) {
		throw new SplitValidationError(`Split ${splitId} not found`);
	}

	if (split.is_default) {
		throw new SplitValidationError('Cannot delete the default split');
	}

	const defaultSplit = db
		.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_default = 1`)
		.get(split.transaction_id) as Split;

	const restoredMinor = toMinorUnits(defaultSplit.amount) + toMinorUnits(split.amount);
	db.prepare(`UPDATE splits SET amount = ? WHERE id = ?`).run(
		fromMinorUnits(restoredMinor),
		defaultSplit.id
	);

	db.prepare(`DELETE FROM splits WHERE id = ?`).run(splitId);
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
		  AND (
		      (t.credit_debit_indicator IN ('DBIT', 'CRDT') AND t.status IN ('booked', 'pending'))
		      OR t.status = 'opening_balance'
		  )
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
