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
	getSplitsWithStatus,
	saveSplits,
	allocateSplit,
	getUnallocatedTransactions,
	getEnvelopes,
	createEnvelope,
	deleteEnvelope,
	resetSplits
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
