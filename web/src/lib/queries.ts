import type Database from 'better-sqlite3';
import { getDb, withRetry } from './db.js';
import { sumAmounts, amountsMatch, toMinorUnits, fromMinorUnits } from './format.js';
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
		ORDER BY a.aspsp_name, a.name
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
export function getOrCreateRoundUpEnvelope(
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
 * If the transaction has no splits yet, create a single default split for
 * the full transaction amount. Idempotent — safe to call multiple times.
 */
export function ensureDefaultSplit(
	transactionId: number,
	db: Database.Database = getDb()
): void {
	withRetry(() =>
		db.transaction(() => {
			const existing = db
				.prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE transaction_id = ? AND is_round_up = 0`)
				.get(transactionId) as { cnt: number };
			if (existing.cnt > 0) return;

			const tx = db
				.prepare(`SELECT amount FROM transactions WHERE id = ?`)
				.get(transactionId) as { amount: string } | null;
			if (!tx) throw new Error(`Transaction ${transactionId} not found`);

			db.prepare(
				`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, ?, 0)`
			).run(transactionId, tx.amount);
		})()
	);
	ensureRoundUpSplit(transactionId, db);
}

/**
 * If the transaction's account has round_up enabled and the transaction is a DBIT
 * with a non-whole amount, ensures an is_round_up split exists and is allocated to
 * the "Round Up" envelope. Idempotent — safe to call multiple times.
 */
export function ensureRoundUpSplit(
	transactionId: number,
	db: Database.Database = getDb()
): void {
	const row = db
		.prepare(
			`SELECT t.amount, t.credit_debit_indicator, t.account_id, a.round_up
			 FROM transactions t
			 JOIN accounts a ON a.id = t.account_id
			 WHERE t.id = ?`
		)
		.get(transactionId) as {
		amount: string;
		credit_debit_indicator: string;
		account_id: number;
		round_up: number;
	} | null;

	if (!row) return;
	if (!row.round_up || row.credit_debit_indicator !== 'DBIT') return;

	const minorUnits = toMinorUnits(row.amount);
	const roundedUp = Math.ceil(minorUnits / 100) * 100;
	const roundUpMinorUnits = roundedUp - minorUnits;

	// Nothing to round up — amount is already a whole number.
	if (roundUpMinorUnits === 0) return;

	withRetry(() =>
		db.transaction(() => {
			// Already has a round-up split — nothing to do.
			const existing = db
				.prepare(`SELECT id FROM splits WHERE transaction_id = ? AND is_round_up = 1`)
				.get(transactionId);
			if (existing) return;

			const roundUpAmount = fromMinorUnits(roundUpMinorUnits);
			const result = db
				.prepare(
					`INSERT INTO splits (transaction_id, amount, sort_order, is_round_up) VALUES (?, ?, 999, 1)`
				)
				.run(transactionId, roundUpAmount);
			const splitId = result.lastInsertRowid as number;

			const envelopeId = getOrCreateRoundUpEnvelope(row.account_id, db);
			db.prepare(`INSERT INTO allocations (envelope_id, split_id) VALUES (?, ?)`)
				.run(envelopeId, splitId);
		})()
	);
}

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
		// Back-fill round-up splits for existing unallocated transactions.
		const txs = db
			.prepare(
				`SELECT id FROM transactions
				 WHERE account_id = ? AND credit_debit_indicator = 'DBIT' AND status IN ('booked', 'pending')`
			)
			.all(accountId) as Array<{ id: number }>;
		for (const tx of txs) {
			ensureRoundUpSplit(tx.id, db);
		}
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

export function saveSplits(
	transactionId: number,
	parts: Array<{ amount: string; note?: string }>,
	db: Database.Database = getDb()
): void {
	if (parts.length < 2) {
		throw new SplitValidationError('A split must have at least 2 parts');
	}

	for (const part of parts) {
		const units = toMinorUnits(part.amount);
		if (units <= 0) {
			throw new SplitValidationError(`Split amount must be greater than zero, got "${part.amount}"`);
		}
	}

	const tx = db
		.prepare(`SELECT amount FROM transactions WHERE id = ?`)
		.get(transactionId) as { amount: string } | null;
	if (!tx) throw new Error(`Transaction ${transactionId} not found`);

	const sum = sumAmounts(parts.map((p) => p.amount));
	if (!amountsMatch(sum, tx.amount)) {
		throw new SplitValidationError(
			`Split amounts sum to ${sum} but transaction amount is ${tx.amount}`
		);
	}

	withRetry(() =>
		db.transaction(() => {
			db.prepare(`DELETE FROM splits WHERE transaction_id = ? AND is_round_up = 0`).run(transactionId);
			const insert = db.prepare(
				`INSERT INTO splits (transaction_id, amount, note, sort_order) VALUES (?, ?, ?, ?)`
			);
			parts.forEach((part, i) => {
				insert.run(transactionId, part.amount, part.note ?? null, i);
			});
		})()
	);
	ensureRoundUpSplit(transactionId, db);
}

/**
 * Reset a transaction back to a single default split (removes any user-defined splits
 * and any allocations for them, then creates the default split).
 */
export function resetSplits(
	transactionId: number,
	db: Database.Database = getDb()
): void {
	withRetry(() =>
		db.transaction(() => {
			db.prepare(`DELETE FROM splits WHERE transaction_id = ? AND is_round_up = 0`).run(transactionId);
		})()
	);
	ensureDefaultSplit(transactionId, db);
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
		ORDER BY t.booking_date ASC, t.id ASC
	`
		)
		.all(accountId) as Transaction[];

	// Ensure every returned transaction has at least a default split
	for (const tx of txs) {
		ensureDefaultSplit(tx.id, db);
	}

	return txs;
}
