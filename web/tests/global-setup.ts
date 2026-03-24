import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../../../migrations');
const fixtureDb = join(__dirname, 'fixture.db');

export default function globalSetup() {
	const db = new Database(fixtureDb);
	db.pragma('foreign_keys = ON');
	db.pragma('journal_mode = WAL');

	// Wipe and recreate schema on each test run
	db.exec(`
		DROP TABLE IF EXISTS allocations;
		DROP TABLE IF EXISTS splits;
		DROP TABLE IF EXISTS envelopes;
		DROP TABLE IF EXISTS transactions;
		DROP TABLE IF EXISTS accounts;
		DROP TABLE IF EXISTS sessions;
	`);

	db.exec(readFileSync(join(migrationsDir, '0001_initial.sql'), 'utf8'));
	db.exec(readFileSync(join(migrationsDir, '0002_envelopes.sql'), 'utf8'));

	// Seed a session
	db.prepare(
		`INSERT INTO sessions (session_id, aspsp_name, psu_type, valid_until, created_at)
		 VALUES ('test-session', 'Monzo', 'personal', '2099-01-01', datetime('now'))`
	).run();
	const sessionId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

	// Seed an account
	db.prepare(
		`INSERT INTO accounts (session_id, account_uid, aspsp_name, name, currency)
		 VALUES (?, 'acc-001', 'Monzo', 'Personal', 'GBP')`
	).run(sessionId);
	const accountId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

	// Seed envelopes
	db.prepare(`INSERT INTO envelopes (account_id, name, sort_order) VALUES (?, 'Groceries', 0)`).run(accountId);
	db.prepare(`INSERT INTO envelopes (account_id, name, sort_order) VALUES (?, 'Transport', 1)`).run(accountId);
	db.prepare(`INSERT INTO envelopes (account_id, name, sort_order) VALUES (?, 'Eating Out', 2)`).run(accountId);

	// Seed transactions: 3 unallocated debits
	const insertTx = db.prepare(
		`INSERT INTO transactions (account_id, booking_date, amount, currency, credit_debit_indicator, status, payee)
		 VALUES (?, ?, ?, 'GBP', 'DBIT', 'booked', ?)`
	);
	insertTx.run(accountId, '2026-03-01', '18.50', 'Tesco Superstore');
	const tx1Id = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

	insertTx.run(accountId, '2026-03-10', '32.00', 'Deliveroo');
	const tx2Id = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

	// Third transaction — split into two parts (pre-seeded)
	insertTx.run(accountId, '2026-03-15', '20.00', 'Waitrose');
	const tx3Id = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
	db.prepare(`INSERT INTO splits (transaction_id, amount, note, sort_order) VALUES (?, '12.00', 'Groceries', 0)`).run(tx3Id);
	db.prepare(`INSERT INTO splits (transaction_id, amount, note, sort_order) VALUES (?, '8.00', 'Household', 1)`).run(tx3Id);

	// A fourth already-fully-allocated transaction (should NOT appear in queue)
	insertTx.run(accountId, '2026-03-20', '5.00', 'Bus ticket');
	const tx4Id = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
	db.prepare(`INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '5.00', 0)`).run(tx4Id);
	const split4Id = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
	const envId = (db.prepare(`SELECT id FROM envelopes WHERE account_id = ? AND name = 'Transport'`).get(accountId) as { id: number }).id;
	db.prepare(`INSERT INTO allocations (envelope_id, split_id) VALUES (?, ?)`).run(envId, split4Id);

	db.close();
}
