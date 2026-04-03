import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
	createTestDb,
	seedAccount,
	seedTransaction,
	seedEnvelope
} from './fixtures.js';
import {
	setAccountRoundUp,
	getSplitsWithStatus,
	allocateSplit,
	getUnallocatedTransactions,
	getEnvelopes,
	deleteEnvelope,
	createSplit,
	deleteSplit,
	ROUND_UP_ENVELOPE_NAME
} from '../queries.js';
import {
	AlreadyAllocatedError,
	EnvelopeHasAllocationsError,
	SplitValidationError
} from '../types.js';

let db: Database.Database;
let accountId: number;

beforeEach(() => {
	db = createTestDb();
	accountId = seedAccount(db);
});

// ---------------------------------------------------------------------------
// envelope goal columns
// ---------------------------------------------------------------------------

describe('envelope goal columns', () => {
	it('envelopes table has goal columns', () => {
		const cols = db
			.prepare(`PRAGMA table_info(envelopes)`)
			.all() as Array<{ name: string }>;
		const names = cols.map((c) => c.name);
		expect(names).toContain('goal_amount');
		expect(names).toContain('goal_rrule');
		expect(names).toContain('goal_dtstart');
		expect(names).toContain('goal_due_date');
		expect(names).toContain('goal_created_at');
	});
});

// ---------------------------------------------------------------------------
// allocateSplit
// ---------------------------------------------------------------------------

describe('allocateSplit', () => {
	it('creates an allocation linking split to envelope', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId);
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };

		allocateSplit(envelopeId, split.id, db);

		const alloc = db.prepare(`SELECT * FROM allocations WHERE split_id = ?`).get(split.id);
		expect(alloc).toBeTruthy();
	});

	it('throws AlreadyAllocatedError on double allocation', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId);
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };

		allocateSplit(envelopeId, split.id, db);
		expect(() => allocateSplit(envelopeId, split.id, db)).toThrow(AlreadyAllocatedError);
	});
});

// ---------------------------------------------------------------------------
// getUnallocatedTransactions
// ---------------------------------------------------------------------------

describe('getUnallocatedTransactions', () => {
	it('returns DBIT booked/pending transactions without full allocation', () => {
		seedTransaction(db, accountId, { amount: '10.00', creditDebit: 'DBIT', status: 'booked' });
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(1);
	});

	it('excludes CRDT transactions', () => {
		seedTransaction(db, accountId, { amount: '10.00', creditDebit: 'CRDT', status: 'booked' });
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(0);
	});

	it('includes opening_balance status', () => {
		seedTransaction(db, accountId, { amount: '10.00', status: 'opening_balance' });
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(1);
	});

	it('excludes fully allocated transactions', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId);
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(0);
	});

	it('includes pending transactions', () => {
		seedTransaction(db, accountId, { amount: '10.00', status: 'pending' });
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(1);
	});

	it('includes a transaction where only some splits are allocated (partially split)', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 1)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId);
		const splits = db.prepare(`SELECT id FROM splits WHERE transaction_id = ? ORDER BY sort_order`).all(txId) as Array<{ id: number }>;
		allocateSplit(envelopeId, splits[0].id, db);

		// Only 1 of 2 splits allocated — still unallocated
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// getEnvelopes
// ---------------------------------------------------------------------------

describe('getEnvelopes', () => {
	it('returns envelopes with zero allocated_raw when empty', () => {
		seedEnvelope(db, accountId, 'Groceries');
		const envelopes = getEnvelopes(accountId, db);
		expect(envelopes).toHaveLength(1);
		expect(envelopes[0].allocated_raw).toBe(0);
	});

	it('sums allocated amounts correctly', () => {
		const txId = seedTransaction(db, accountId, { amount: '25.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '25.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId, 'Rent');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		const envelopes = getEnvelopes(accountId, db);
		expect(envelopes[0].allocated_raw).toBeCloseTo(25.0);
		expect(envelopes[0].allocated_total).toBe('25.00');
	});

	it('does not include CRDT transaction amounts in totals', () => {
		const txId = seedTransaction(db, accountId, { amount: '50.00', creditDebit: 'CRDT' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '50.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId, 'Income');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		const envelopes = getEnvelopes(accountId, db);
		expect(envelopes[0].allocated_raw).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// deleteEnvelope
// ---------------------------------------------------------------------------

describe('deleteEnvelope', () => {
	it('deletes an empty envelope', () => {
		const envelopeId = seedEnvelope(db, accountId, 'Empty');
		deleteEnvelope(envelopeId, db);
		const row = db.prepare(`SELECT * FROM envelopes WHERE id = ?`).get(envelopeId);
		expect(row).toBeUndefined();
	});

	it('throws EnvelopeHasAllocationsError when allocations exist', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId, 'Has Allocations');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		expect(() => deleteEnvelope(envelopeId, db)).toThrow(EnvelopeHasAllocationsError);
	});
});

// ---------------------------------------------------------------------------
// getSplitsWithStatus
// ---------------------------------------------------------------------------

describe('getSplitsWithStatus', () => {
	it('returns is_allocated=false for unallocated splits', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits).toHaveLength(1);
		expect(splits[0].is_allocated).toBe(false);
		expect(splits[0].envelope_id).toBeNull();
	});

	it('returns is_allocated=true with envelope info after allocation', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId, 'Transport');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits[0].is_allocated).toBe(true);
		expect(splits[0].envelope_id).toBe(envelopeId);
		expect(splits[0].envelope_name).toBe('Transport');
	});

	it('returns is_default as boolean true for the default split', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '20.00', 0, 1, 0)`
		).run(txId);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits).toHaveLength(1);
		expect(splits[0].is_default).toBe(true);
		expect(typeof splits[0].is_default).toBe('boolean');
	});

	it('returns is_default as boolean false for a non-default split', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '15.00', 0, 1, 0)`
		).run(txId);
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '5.00', 1, 0, 0)`
		).run(txId);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits).toHaveLength(2);
		const nonDefault = splits.find((s) => !s.is_default);
		expect(nonDefault).toBeDefined();
		expect(nonDefault!.is_default).toBe(false);
		expect(typeof nonDefault!.is_default).toBe('boolean');
	});

	it('returns is_round_up as boolean false for regular splits', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '10.00', 0, 1, 0)`
		).run(txId);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits).toHaveLength(1);
		expect(splits[0].is_round_up).toBe(false);
		expect(typeof splits[0].is_round_up).toBe('boolean');
	});
});

// ---------------------------------------------------------------------------
// setAccountRoundUp
// ---------------------------------------------------------------------------

describe('setAccountRoundUp', () => {
	it('enabling creates the Round Up envelope', () => {
		setAccountRoundUp(accountId, '2025-06-01', db);
		const envelope = db.prepare(`SELECT name FROM envelopes WHERE account_id = ? AND name = ?`).get(accountId, ROUND_UP_ENVELOPE_NAME);
		expect(envelope).toBeTruthy();
	});

	it('disabling sets round_up_since to null', () => {
		setAccountRoundUp(accountId, '2025-06-01', db);
		setAccountRoundUp(accountId, null, db);
		const row = db.prepare(`SELECT round_up_since FROM accounts WHERE id = ?`).get(accountId) as { round_up_since: string | null };
		expect(row.round_up_since).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// createSplit
// ---------------------------------------------------------------------------

describe('createSplit', () => {
	it('creates a new split and reduces the default split amount', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '20.00', 0, 1, 0)`
		).run(txId);

		const newSplit = createSplit(txId, '7.50', 'Lunch', db);

		expect(newSplit.amount).toBe('7.50');
		expect(newSplit.note).toBe('Lunch');
		expect(newSplit.is_default).toBeFalsy();
		expect(newSplit.is_round_up).toBeFalsy();
		expect(newSplit.transaction_id).toBe(txId);

		const defaultSplit = db
			.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_default = 1`)
			.get(txId) as { amount: string };
		expect(defaultSplit.amount).toBe('12.50');
	});

	it('throws SplitValidationError if amount >= default split amount', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '10.00', 0, 1, 0)`
		).run(txId);

		expect(() => createSplit(txId, '10.00', null, db)).toThrow(SplitValidationError);
		expect(() => createSplit(txId, '15.00', null, db)).toThrow(SplitValidationError);
	});

	it('throws SplitValidationError if amount <= 0', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '10.00', 0, 1, 0)`
		).run(txId);

		expect(() => createSplit(txId, '0.00', null, db)).toThrow(SplitValidationError);
	});
});

// ---------------------------------------------------------------------------
// deleteSplit
// ---------------------------------------------------------------------------

describe('deleteSplit', () => {
	it('deletes the split and returns its amount to the default split', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '15.00', 0, 1, 0)`
		).run(txId);
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '5.00', 1, 0, 0)`
		).run(txId);

		const nonDefault = db
			.prepare(`SELECT id FROM splits WHERE transaction_id = ? AND is_default = 0`)
			.get(txId) as { id: number };

		deleteSplit(nonDefault.id, db);

		const gone = db.prepare(`SELECT * FROM splits WHERE id = ?`).get(nonDefault.id);
		expect(gone).toBeUndefined();

		const defaultSplit = db
			.prepare(`SELECT amount FROM splits WHERE transaction_id = ? AND is_default = 1`)
			.get(txId) as { amount: string };
		expect(defaultSplit.amount).toBe('20.00');
	});

	it('throws SplitValidationError when trying to delete the default split', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		db.prepare(
			`INSERT INTO splits (transaction_id, amount, sort_order, is_default, is_round_up) VALUES (?, '10.00', 0, 1, 0)`
		).run(txId);

		const defaultSplit = db
			.prepare(`SELECT id FROM splits WHERE transaction_id = ? AND is_default = 1`)
			.get(txId) as { id: number };

		expect(() => deleteSplit(defaultSplit.id, db)).toThrow(SplitValidationError);
	});
});
