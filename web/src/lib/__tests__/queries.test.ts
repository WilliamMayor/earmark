import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
	createTestDb,
	seedAccount,
	seedTransaction,
	seedEnvelope,
	seedWithdrawal
} from './fixtures.js';
import {
	getAccounts,
	getAccount,
	createAccount,
	setAccountRoundUp,
	getSplitsWithStatus,
	allocateSplit,
	getUnallocatedTransactions,
	getEnvelopes,
	deleteEnvelope,
	createSplit,
	deleteSplit,
	ROUND_UP_ENVELOPE_NAME,
	getEnvelope,
	setGoal,
	removeGoal,
	getGoalContribution,
	getTransactions,
	createTransaction,
	createWithdrawal,
	allocateWithdrawal
} from '../queries.js';
import {
	AlreadyAllocatedError,
	EnvelopeHasAllocationsError,
	SplitValidationError,
	TransactionValidationError,
	WithdrawalAlreadyAllocatedError
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

	it('includes CRDT transactions', () => {
		seedTransaction(db, accountId, { amount: '10.00', creditDebit: 'CRDT', status: 'booked' });
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(1);
		expect(txs[0].credit_debit_indicator).toBe('CRDT');
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

// ---------------------------------------------------------------------------
// getEnvelope
// ---------------------------------------------------------------------------

describe('getEnvelope', () => {
	it('returns null for a non-existent id', () => {
		expect(getEnvelope(9999, db)).toBeNull();
	});

	it('returns the envelope with goal_balance of 0 when no allocations', () => {
		const envelopeId = seedEnvelope(db, accountId, 'Test');
		const envelope = getEnvelope(envelopeId, db);
		expect(envelope).not.toBeNull();
		expect(envelope!.goal_balance).toBe(0);
	});

	it('adds CRDT allocations to goal_balance', () => {
		const txId = seedTransaction(db, accountId, { amount: '50.00', creditDebit: 'CRDT' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '50.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId, 'Savings');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		const envelope = getEnvelope(envelopeId, db);
		expect(envelope!.goal_balance).toBeCloseTo(50);
	});

	it('subtracts DBIT allocations from goal_balance', () => {
		const crTxId = seedTransaction(db, accountId, { amount: '50.00', creditDebit: 'CRDT' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '50.00', 0)`).run(crTxId);
		const dbTxId = seedTransaction(db, accountId, { amount: '20.00', creditDebit: 'DBIT' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '20.00', 0)`).run(dbTxId);

		const envelopeId = seedEnvelope(db, accountId, 'Savings');
		const crSplit = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(crTxId) as { id: number };
		const dbSplit = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(dbTxId) as { id: number };
		allocateSplit(envelopeId, crSplit.id, db);
		allocateSplit(envelopeId, dbSplit.id, db);

		const envelope = getEnvelope(envelopeId, db);
		expect(envelope!.goal_balance).toBeCloseTo(30);
	});
});

// ---------------------------------------------------------------------------
// setGoal / removeGoal
// ---------------------------------------------------------------------------

describe('setGoal', () => {
	it('sets goal columns on the envelope', () => {
		const envelopeId = seedEnvelope(db, accountId, 'Bills');
		setGoal(envelopeId, { amount: '30.00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=5', dtstart: '2026-05-05', dueDate: null }, db);

		const row = db.prepare(`SELECT * FROM envelopes WHERE id = ?`).get(envelopeId) as Record<string, unknown>;
		expect(row.goal_amount).toBe('30.00');
		expect(row.goal_rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=5');
		expect(row.goal_created_at).not.toBeNull();
	});

	it('does not reset goal_created_at on subsequent calls', () => {
		const envelopeId = seedEnvelope(db, accountId, 'Bills');
		setGoal(envelopeId, { amount: '30.00', rrule: null, dtstart: null, dueDate: '2026-08-01' }, db);
		const first = (db.prepare(`SELECT goal_created_at FROM envelopes WHERE id = ?`).get(envelopeId) as { goal_created_at: string }).goal_created_at;

		setGoal(envelopeId, { amount: '50.00', rrule: null, dtstart: null, dueDate: '2026-09-01' }, db);
		const second = (db.prepare(`SELECT goal_created_at FROM envelopes WHERE id = ?`).get(envelopeId) as { goal_created_at: string }).goal_created_at;

		expect(first).toBe(second);
	});
});

describe('removeGoal', () => {
	it('nulls all goal columns', () => {
		const envelopeId = seedEnvelope(db, accountId, 'Bills');
		setGoal(envelopeId, { amount: '30.00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=5', dtstart: '2026-05-05', dueDate: null }, db);
		removeGoal(envelopeId, db);

		const row = db.prepare(`SELECT * FROM envelopes WHERE id = ?`).get(envelopeId) as Record<string, unknown>;
		expect(row.goal_amount).toBeNull();
		expect(row.goal_rrule).toBeNull();
		expect(row.goal_dtstart).toBeNull();
		expect(row.goal_due_date).toBeNull();
		expect(row.goal_created_at).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// getGoalContribution
// ---------------------------------------------------------------------------

describe('getGoalContribution', () => {
	it('returns 0 when no allocations since given date', () => {
		const envelopeId = seedEnvelope(db, accountId, 'Test');
		expect(getGoalContribution(envelopeId, '2026-01-01', db)).toBe(0);
	});

	it('counts CRDT allocations on or after since date', () => {
		const txId = seedTransaction(db, accountId, { amount: '100.00', creditDebit: 'CRDT', date: '2026-03-15' });
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '100.00', 0)`).run(txId);
		const envelopeId = seedEnvelope(db, accountId, 'Savings');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		expect(getGoalContribution(envelopeId, '2026-01-01', db)).toBeCloseTo(100);
		expect(getGoalContribution(envelopeId, '2026-04-01', db)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

describe('createAccount', () => {
	it('creates an account with null lunchflow_id', () => {
		const id = createAccount('Starling', 'Savings', 'GBP', db);
		const account = getAccount(id, db);
		expect(account).not.toBeNull();
		expect(account!.lunchflow_id).toBeNull();
		expect(account!.institution_name).toBe('Starling');
		expect(account!.name).toBe('Savings');
		expect(account!.currency).toBe('GBP');
	});

	it('accepts a null name', () => {
		const id = createAccount('Cash', null, 'GBP', db);
		const account = getAccount(id, db);
		expect(account!.name).toBeNull();
	});

	it('returns the new account id', () => {
		const id = createAccount('Test Bank', 'Current', 'EUR', db);
		expect(typeof id).toBe('number');
		expect(id).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// getAccounts — balance
// ---------------------------------------------------------------------------

describe('getAccounts balance', () => {
	it('returns "0.00" balance for an account with no transactions', () => {
		const accounts = getAccounts(db);
		expect(accounts).toHaveLength(1);
		expect(accounts[0].balance).toBe('0.00');
	});

	it('computes balance as CRDT minus DBIT across all statuses', () => {
		seedTransaction(db, accountId, { amount: '100.00', creditDebit: 'CRDT', status: 'booked' });
		seedTransaction(db, accountId, { amount: '30.00', creditDebit: 'DBIT', status: 'booked' });
		seedTransaction(db, accountId, { amount: '10.00', creditDebit: 'DBIT', status: 'pending' });
		seedTransaction(db, accountId, { amount: '5.00', creditDebit: 'CRDT', status: 'opening_balance' });

		const accounts = getAccounts(db);
		// 100.00 + 5.00 - 30.00 - 10.00 = 65.00
		expect(accounts[0].balance).toBe('65.00');
	});

	it('returns a negative balance string when debits exceed credits', () => {
		seedTransaction(db, accountId, { amount: '50.00', creditDebit: 'DBIT', status: 'booked' });
		const accounts = getAccounts(db);
		expect(accounts[0].balance).toBe('-50.00');
	});
});

// ---------------------------------------------------------------------------
// getAccount — balance
// ---------------------------------------------------------------------------

describe('getAccount balance', () => {
	it('returns "0.00" balance for an account with no transactions', () => {
		const account = getAccount(accountId, db);
		expect(account).not.toBeNull();
		expect(account!.balance).toBe('0.00');
	});

	it('computes balance correctly for a single account', () => {
		seedTransaction(db, accountId, { amount: '200.00', creditDebit: 'CRDT', status: 'booked' });
		seedTransaction(db, accountId, { amount: '75.50', creditDebit: 'DBIT', status: 'booked' });

		const account = getAccount(accountId, db);
		// 200.00 - 75.50 = 124.50
		expect(account!.balance).toBe('124.50');
	});

	it('returns a negative balance string when debits exceed credits', () => {
		seedTransaction(db, accountId, { amount: '50.00', creditDebit: 'DBIT', status: 'booked' });
		const account = getAccount(accountId, db);
		expect(account!.balance).toBe('-50.00');
	});
});

// ---------------------------------------------------------------------------
// getTransactions
// ---------------------------------------------------------------------------

describe('getTransactions', () => {
	it('returns all transactions for an account newest first', () => {
		seedTransaction(db, accountId, { date: '2026-01-01', merchant: 'Old Shop' });
		seedTransaction(db, accountId, { date: '2026-03-15', merchant: 'New Shop' });
		const txs = getTransactions(accountId, db);
		expect(txs).toHaveLength(2);
		expect(txs[0].merchant).toBe('New Shop');
		expect(txs[1].merchant).toBe('Old Shop');
	});

	it('returns empty array when account has no transactions', () => {
		expect(getTransactions(accountId, db)).toHaveLength(0);
	});

	it('does not return transactions from other accounts', () => {
		const otherId = seedAccount(db, { institutionName: 'Other Bank' });
		seedTransaction(db, otherId);
		expect(getTransactions(accountId, db)).toHaveLength(0);
	});

	it('includes all statuses', () => {
		seedTransaction(db, accountId, { status: 'booked' });
		seedTransaction(db, accountId, { status: 'pending' });
		seedTransaction(db, accountId, { status: 'opening_balance' });
		expect(getTransactions(accountId, db)).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

describe('createTransaction', () => {
	it('creates a DBIT transaction for a negative amount', () => {
		createTransaction(accountId, '-12.50', 'Weekly shop', '2026-04-01', null, db);
		const txs = getTransactions(accountId, db);
		expect(txs).toHaveLength(1);
		expect(txs[0].credit_debit_indicator).toBe('DBIT');
		expect(txs[0].amount).toBe('12.50');
	});

	it('creates a CRDT transaction for a positive amount', () => {
		createTransaction(accountId, '500.00', 'Salary', '2026-04-01', null, db);
		const txs = getTransactions(accountId, db);
		expect(txs[0].credit_debit_indicator).toBe('CRDT');
		expect(txs[0].amount).toBe('500.00');
	});

	it('stores description and merchant', () => {
		createTransaction(accountId, '-5.00', 'Coffee', '2026-04-01', 'Pret', db);
		const txs = getTransactions(accountId, db);
		expect(txs[0].description).toBe('Coffee');
		expect(txs[0].merchant).toBe('Pret');
	});

	it('defaults date to today when null', () => {
		const today = new Date().toISOString().slice(0, 10);
		createTransaction(accountId, '-1.00', 'Test', null, null, db);
		const txs = getTransactions(accountId, db);
		expect(txs[0].date).toBe(today);
	});

	it('sets status to booked and lunchflow_id to null', () => {
		createTransaction(accountId, '-1.00', 'Test', null, null, db);
		const txs = getTransactions(accountId, db);
		expect(txs[0].status).toBe('booked');
		expect(txs[0].lunchflow_id).toBeNull();
	});

	it('throws TransactionValidationError for non-numeric amount', () => {
		expect(() => createTransaction(accountId, 'abc', 'Test', null, null, db))
			.toThrow(TransactionValidationError);
	});

	it('creates a default split matching the transaction amount', () => {
		const txId = createTransaction(accountId, '-18.50', 'Dinner', '2026-04-01', null, db);
		const split = db
			.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_default = 1`)
			.get(txId) as { amount: string; is_default: number } | undefined;
		expect(split).toBeDefined();
		expect(split!.amount).toBe('18.50');
		expect(split!.is_default).toBe(1);
	});

	it('creates exactly one default split', () => {
		const txId = createTransaction(accountId, '-10.00', 'Test', '2026-04-01', null, db);
		const splits = db
			.prepare(`SELECT * FROM splits WHERE transaction_id = ?`)
			.all(txId) as Array<unknown>;
		expect(splits).toHaveLength(1);
	});

	it('creates a default split for CRDT transactions too', () => {
		const txId = createTransaction(accountId, '500.00', 'Salary', '2026-04-01', null, db);
		const split = db
			.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_default = 1`)
			.get(txId) as { amount: string } | undefined;
		expect(split).toBeDefined();
		expect(split!.amount).toBe('500.00');
	});
});

// ---------------------------------------------------------------------------
// createWithdrawal
// ---------------------------------------------------------------------------

describe('createWithdrawal', () => {
    it('inserts a row with to_envelope_id = null', () => {
        const envelopeId = seedEnvelope(db, accountId, 'Savings');
        createWithdrawal(envelopeId, '50.00', null, db);

        const row = db
            .prepare(`SELECT * FROM envelope_withdrawals WHERE from_envelope_id = ?`)
            .get(envelopeId) as { amount: string; to_envelope_id: null; note: null };
        expect(row).toBeDefined();
        expect(row.amount).toBe('50.00');
        expect(row.to_envelope_id).toBeNull();
        expect(row.note).toBeNull();
    });

    it('stores an optional note', () => {
        const envelopeId = seedEnvelope(db, accountId, 'Savings');
        createWithdrawal(envelopeId, '30.00', 'Cover petrol', db);

        const row = db
            .prepare(`SELECT note FROM envelope_withdrawals WHERE from_envelope_id = ?`)
            .get(envelopeId) as { note: string };
        expect(row.note).toBe('Cover petrol');
    });

    it('throws SplitValidationError when amount is zero', () => {
        const envelopeId = seedEnvelope(db, accountId, 'Savings');
        expect(() => createWithdrawal(envelopeId, '0.00', null, db)).toThrow(SplitValidationError);
    });

    it('throws SplitValidationError when amount is negative', () => {
        const envelopeId = seedEnvelope(db, accountId, 'Savings');
        expect(() => createWithdrawal(envelopeId, '-5.00', null, db)).toThrow(SplitValidationError);
    });
});

// ---------------------------------------------------------------------------
// allocateWithdrawal
// ---------------------------------------------------------------------------

describe('allocateWithdrawal', () => {
    it('sets to_envelope_id on the withdrawal', () => {
        const fromId = seedEnvelope(db, accountId, 'Savings');
        const toId = seedEnvelope(db, accountId, 'Petrol');
        const withdrawalId = seedWithdrawal(db, fromId, { amount: '50.00' });

        allocateWithdrawal(withdrawalId, toId, db);

        const row = db
            .prepare(`SELECT to_envelope_id FROM envelope_withdrawals WHERE id = ?`)
            .get(withdrawalId) as { to_envelope_id: number };
        expect(row.to_envelope_id).toBe(toId);
    });

    it('throws WithdrawalAlreadyAllocatedError when already allocated', () => {
        const fromId = seedEnvelope(db, accountId, 'Savings');
        const toId = seedEnvelope(db, accountId, 'Petrol');
        const withdrawalId = seedWithdrawal(db, fromId, { amount: '50.00' });

        allocateWithdrawal(withdrawalId, toId, db);
        expect(() => allocateWithdrawal(withdrawalId, toId, db)).toThrow(WithdrawalAlreadyAllocatedError);
    });
});
