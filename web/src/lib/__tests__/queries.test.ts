import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
	createTestDb,
	seedAccount,
	seedTransaction,
	seedEnvelope
} from './fixtures.js';
import {
	ensureDefaultSplit,
	ensureRoundUpSplit,
	getOrCreateRoundUpEnvelope,
	setAccountRoundUp,
	getSplitsWithStatus,
	saveSplits,
	allocateSplit,
	getUnallocatedTransactions,
	getEnvelopes,
	createEnvelope,
	deleteEnvelope,
	resetSplits,
	ROUND_UP_ENVELOPE_NAME
} from '../queries.js';
import {
	SplitValidationError,
	AlreadyAllocatedError,
	EnvelopeHasAllocationsError
} from '../types.js';

let db: Database.Database;
let accountId: number;

beforeEach(() => {
	db = createTestDb();
	accountId = seedAccount(db);
});

// ---------------------------------------------------------------------------
// ensureDefaultSplit
// ---------------------------------------------------------------------------

describe('ensureDefaultSplit', () => {
	it('creates a single split matching the transaction amount', () => {
		const txId = seedTransaction(db, accountId, { amount: '18.50' });
		ensureDefaultSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ?`).all(txId) as Array<{ amount: string }>;
		expect(splits).toHaveLength(1);
		expect(splits[0].amount).toBe('18.50');
	});

	it('is idempotent — does not create a second split on repeated calls', () => {
		const txId = seedTransaction(db, accountId, { amount: '5.00' });
		ensureDefaultSplit(txId, db);
		ensureDefaultSplit(txId, db);
		ensureDefaultSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ?`).all(txId);
		expect(splits).toHaveLength(1);
	});

	it('does not overwrite user-defined splits', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		// Create user-defined splits manually
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 0)`).run(txId);
		db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 1)`).run(txId);

		ensureDefaultSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ?`).all(txId);
		expect(splits).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// saveSplits
// ---------------------------------------------------------------------------

describe('saveSplits', () => {
	it('saves two valid parts that sum to the transaction amount', () => {
		const txId = seedTransaction(db, accountId, { amount: '18.50' });
		saveSplits(txId, [{ amount: '8.00' }, { amount: '10.50' }], db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? ORDER BY sort_order`).all(txId) as Array<{ amount: string }>;
		expect(splits).toHaveLength(2);
		expect(splits[0].amount).toBe('8.00');
		expect(splits[1].amount).toBe('10.50');
	});

	it('rejects fewer than 2 parts', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		expect(() => saveSplits(txId, [{ amount: '10.00' }], db)).toThrow(SplitValidationError);
	});

	it('rejects parts that do not sum to transaction amount', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		expect(() =>
			saveSplits(txId, [{ amount: '5.00' }, { amount: '3.00' }], db)
		).toThrow(SplitValidationError);
	});

	it('rejects zero-amount parts', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		expect(() =>
			saveSplits(txId, [{ amount: '0.00' }, { amount: '10.00' }], db)
		).toThrow(SplitValidationError);
	});

	it('rejects negative-amount parts', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		expect(() =>
			saveSplits(txId, [{ amount: '-5.00' }, { amount: '15.00' }], db)
		).toThrow(SplitValidationError);
	});

	it('replaces existing splits atomically', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		saveSplits(txId, [{ amount: '10.00' }, { amount: '10.00' }], db);
		saveSplits(txId, [{ amount: '15.00' }, { amount: '5.00' }], db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? ORDER BY sort_order`).all(txId) as Array<{ amount: string }>;
		expect(splits).toHaveLength(2);
		expect(splits[0].amount).toBe('15.00');
		expect(splits[1].amount).toBe('5.00');
	});

	it('saves optional note', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		saveSplits(txId, [{ amount: '6.00', note: 'Lunch' }, { amount: '4.00' }], db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? ORDER BY sort_order`).all(txId) as Array<{ note: string | null }>;
		expect(splits[0].note).toBe('Lunch');
		expect(splits[1].note).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// allocateSplit
// ---------------------------------------------------------------------------

describe('allocateSplit', () => {
	it('creates an allocation linking split to envelope', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		ensureDefaultSplit(txId, db);
		const envelopeId = seedEnvelope(db, accountId);
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };

		allocateSplit(envelopeId, split.id, db);

		const alloc = db.prepare(`SELECT * FROM allocations WHERE split_id = ?`).get(split.id);
		expect(alloc).toBeTruthy();
	});

	it('throws AlreadyAllocatedError on double allocation', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		ensureDefaultSplit(txId, db);
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

	it('excludes opening_balance status', () => {
		seedTransaction(db, accountId, { amount: '10.00', status: 'opening_balance' });
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs).toHaveLength(0);
	});

	it('excludes fully allocated transactions', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		ensureDefaultSplit(txId, db);
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

	it('creates default splits as a side effect', () => {
		const txId = seedTransaction(db, accountId, { amount: '15.00' });
		const before = db.prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE transaction_id = ?`).get(txId) as { cnt: number };
		expect(before.cnt).toBe(0);

		getUnallocatedTransactions(accountId, db);

		const after = db.prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE transaction_id = ?`).get(txId) as { cnt: number };
		expect(after.cnt).toBe(1);
	});

	it('includes a transaction where only some splits are allocated (partially split)', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		saveSplits(txId, [{ amount: '10.00' }, { amount: '10.00' }], db);
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
		ensureDefaultSplit(txId, db);
		const envelopeId = seedEnvelope(db, accountId, 'Rent');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		const envelopes = getEnvelopes(accountId, db);
		expect(envelopes[0].allocated_raw).toBeCloseTo(25.0);
		expect(envelopes[0].allocated_total).toBe('25.00');
	});

	it('does not include CRDT transaction amounts in totals', () => {
		const txId = seedTransaction(db, accountId, { amount: '50.00', creditDebit: 'CRDT' });
		ensureDefaultSplit(txId, db);
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
		ensureDefaultSplit(txId, db);
		const envelopeId = seedEnvelope(db, accountId, 'Has Allocations');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		expect(() => deleteEnvelope(envelopeId, db)).toThrow(EnvelopeHasAllocationsError);
	});
});

// ---------------------------------------------------------------------------
// resetSplits
// ---------------------------------------------------------------------------

describe('resetSplits', () => {
	it('replaces user-defined splits with a single default split', () => {
		const txId = seedTransaction(db, accountId, { amount: '20.00' });
		saveSplits(txId, [{ amount: '10.00' }, { amount: '10.00' }], db);

		resetSplits(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ?`).all(txId) as Array<{ amount: string }>;
		expect(splits).toHaveLength(1);
		expect(splits[0].amount).toBe('20.00');
	});
});

// ---------------------------------------------------------------------------
// getSplitsWithStatus
// ---------------------------------------------------------------------------

describe('getSplitsWithStatus', () => {
	it('returns is_allocated=false for unallocated splits', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		ensureDefaultSplit(txId, db);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits).toHaveLength(1);
		expect(splits[0].is_allocated).toBe(false);
		expect(splits[0].envelope_id).toBeNull();
	});

	it('returns is_allocated=true with envelope info after allocation', () => {
		const txId = seedTransaction(db, accountId, { amount: '10.00' });
		ensureDefaultSplit(txId, db);
		const envelopeId = seedEnvelope(db, accountId, 'Transport');
		const split = db.prepare(`SELECT id FROM splits WHERE transaction_id = ?`).get(txId) as { id: number };
		allocateSplit(envelopeId, split.id, db);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits[0].is_allocated).toBe(true);
		expect(splits[0].envelope_id).toBe(envelopeId);
		expect(splits[0].envelope_name).toBe('Transport');
	});
});

// ---------------------------------------------------------------------------
// getOrCreateRoundUpEnvelope
// ---------------------------------------------------------------------------

describe('getOrCreateRoundUpEnvelope', () => {
	it('creates the Round Up envelope on first call', () => {
		const envelopeId = getOrCreateRoundUpEnvelope(accountId, db);
		const row = db.prepare(`SELECT name FROM envelopes WHERE id = ?`).get(envelopeId) as { name: string };
		expect(row.name).toBe(ROUND_UP_ENVELOPE_NAME);
	});

	it('returns the same id on subsequent calls (idempotent)', () => {
		const id1 = getOrCreateRoundUpEnvelope(accountId, db);
		const id2 = getOrCreateRoundUpEnvelope(accountId, db);
		expect(id1).toBe(id2);
	});

	it('creates separate envelopes for different accounts', () => {
		// Insert a second account directly to avoid session_id collision in seedAccount
		db.prepare(
			`INSERT INTO accounts (lunchflow_id, institution_name, name, currency)
			 VALUES (2, 'Barclays', 'Current', 'GBP')`
		).run();
		const accountId2 = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
		const id1 = getOrCreateRoundUpEnvelope(accountId, db);
		const id2 = getOrCreateRoundUpEnvelope(accountId2, db);
		expect(id1).not.toBe(id2);
	});
});

// ---------------------------------------------------------------------------
// ensureRoundUpSplit
// ---------------------------------------------------------------------------

describe('ensureRoundUpSplit', () => {
	beforeEach(() => {
		// Enable round_up on the account
		db.prepare(`UPDATE accounts SET round_up = 1 WHERE id = ?`).run(accountId);
	});

	it('creates a round-up split for a non-whole DBIT amount', () => {
		const txId = seedTransaction(db, accountId, { amount: '4.75' });
		ensureDefaultSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId) as Array<{ amount: string }>;
		expect(splits).toHaveLength(1);
		expect(splits[0].amount).toBe('0.25');
	});

	it('auto-allocates the round-up split to the Round Up envelope', () => {
		const txId = seedTransaction(db, accountId, { amount: '4.75' });
		ensureDefaultSplit(txId, db);

		const roundUpSplit = db.prepare(`SELECT id FROM splits WHERE transaction_id = ? AND is_round_up = 1`).get(txId) as { id: number };
		const alloc = db.prepare(`SELECT * FROM allocations WHERE split_id = ?`).get(roundUpSplit.id);
		expect(alloc).toBeTruthy();

		const envelope = db.prepare(
			`SELECT e.name FROM envelopes e JOIN allocations al ON al.envelope_id = e.id WHERE al.split_id = ?`
		).get(roundUpSplit.id) as { name: string };
		expect(envelope.name).toBe(ROUND_UP_ENVELOPE_NAME);
	});

	it('does not create a round-up split for a whole-number amount', () => {
		const txId = seedTransaction(db, accountId, { amount: '5.00' });
		ensureDefaultSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId);
		expect(splits).toHaveLength(0);
	});

	it('does not create a round-up split for CRDT transactions', () => {
		const txId = seedTransaction(db, accountId, { amount: '4.75', creditDebit: 'CRDT' });
		ensureDefaultSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId);
		expect(splits).toHaveLength(0);
	});

	it('does not create a round-up split when round_up is disabled', () => {
		db.prepare(`UPDATE accounts SET round_up = 0 WHERE id = ?`).run(accountId);
		const txId = seedTransaction(db, accountId, { amount: '4.75' });
		ensureDefaultSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId);
		expect(splits).toHaveLength(0);
	});

	it('is idempotent — does not create a second round-up split on repeated calls', () => {
		const txId = seedTransaction(db, accountId, { amount: '4.75' });
		ensureRoundUpSplit(txId, db);
		ensureRoundUpSplit(txId, db);
		ensureRoundUpSplit(txId, db);

		const splits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId);
		expect(splits).toHaveLength(1);
	});

	it('round-up split is hidden from getSplitsWithStatus', () => {
		const txId = seedTransaction(db, accountId, { amount: '4.75' });
		ensureDefaultSplit(txId, db);

		const splits = getSplitsWithStatus(txId, db);
		expect(splits.every(s => !s.is_round_up)).toBe(true);
		// Only the normal split (4.75) is visible
		expect(splits).toHaveLength(1);
		expect(splits[0].amount).toBe('4.75');
	});
});

// ---------------------------------------------------------------------------
// saveSplits with round-up account
// ---------------------------------------------------------------------------

describe('saveSplits with round_up enabled', () => {
	beforeEach(() => {
		db.prepare(`UPDATE accounts SET round_up = 1 WHERE id = ?`).run(accountId);
	});

	it('preserves the round-up split when user redefines splits', () => {
		const txId = seedTransaction(db, accountId, { amount: '18.75' });
		ensureDefaultSplit(txId, db);

		// User defines 2 splits that sum to transaction amount
		saveSplits(txId, [{ amount: '10.00' }, { amount: '8.75' }], db);

		const userSplits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 0 ORDER BY sort_order`).all(txId) as Array<{ amount: string }>;
		expect(userSplits).toHaveLength(2);
		expect(userSplits[0].amount).toBe('10.00');
		expect(userSplits[1].amount).toBe('8.75');

		const roundUpSplits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId) as Array<{ amount: string }>;
		expect(roundUpSplits).toHaveLength(1);
		expect(roundUpSplits[0].amount).toBe('0.25');
	});

	it('round-up split auto-allocation means transaction is not prematurely excluded from queue', () => {
		const txId = seedTransaction(db, accountId, { amount: '4.75' });
		ensureDefaultSplit(txId, db);

		// The round-up split is auto-allocated but the normal split is not
		const txs = getUnallocatedTransactions(accountId, db);
		expect(txs.some(t => t.id === txId)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// resetSplits with round-up account
// ---------------------------------------------------------------------------

describe('resetSplits with round_up enabled', () => {
	it('re-creates the round-up split after reset', () => {
		db.prepare(`UPDATE accounts SET round_up = 1 WHERE id = ?`).run(accountId);
		const txId = seedTransaction(db, accountId, { amount: '9.50' });
		saveSplits(txId, [{ amount: '5.00' }, { amount: '4.50' }], db);

		resetSplits(txId, db);

		const userSplits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 0`).all(txId) as Array<{ amount: string }>;
		expect(userSplits).toHaveLength(1);
		expect(userSplits[0].amount).toBe('9.50');

		const roundUpSplits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId) as Array<{ amount: string }>;
		expect(roundUpSplits).toHaveLength(1);
		expect(roundUpSplits[0].amount).toBe('0.50');
	});
});

// ---------------------------------------------------------------------------
// setAccountRoundUp
// ---------------------------------------------------------------------------

describe('setAccountRoundUp', () => {
	it('enabling creates the Round Up envelope', () => {
		setAccountRoundUp(accountId, true, db);
		const envelope = db.prepare(`SELECT name FROM envelopes WHERE account_id = ? AND name = ?`).get(accountId, ROUND_UP_ENVELOPE_NAME);
		expect(envelope).toBeTruthy();
	});

	it('enabling back-fills round-up splits for existing DBIT transactions', () => {
		const txId = seedTransaction(db, accountId, { amount: '7.30' });
		ensureDefaultSplit(txId, db);

		setAccountRoundUp(accountId, true, db);

		const roundUpSplits = db.prepare(`SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1`).all(txId) as Array<{ amount: string }>;
		expect(roundUpSplits).toHaveLength(1);
		expect(roundUpSplits[0].amount).toBe('0.70');
	});

	it('disabling sets round_up flag to 0', () => {
		setAccountRoundUp(accountId, true, db);
		setAccountRoundUp(accountId, false, db);
		const row = db.prepare(`SELECT round_up FROM accounts WHERE id = ?`).get(accountId) as { round_up: number };
		expect(row.round_up).toBe(0);
	});
});
