import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../../../../migrations');

export function createTestDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	db.pragma('journal_mode = WAL');

	const schema0001 = readFileSync(join(migrationsDir, '0001_initial.sql'), 'utf8');
	const schema0002 = readFileSync(join(migrationsDir, '0002_envelopes.sql'), 'utf8');
	const schema0003 = readFileSync(join(migrationsDir, '0003_round_up.sql'), 'utf8');

	db.exec(schema0001);
	db.exec(schema0002);
	db.exec(schema0003);

	return db;
}

interface SeedOptions {
	aspspName?: string;
	accountName?: string;
	currency?: string;
}

export function seedAccount(db: Database.Database, opts: SeedOptions = {}): number {
	const { aspspName = 'Monzo', accountName = 'Personal', currency = 'GBP' } = opts;

	// Insert a minimal session first
	db.prepare(
		`INSERT INTO sessions (session_id, aspsp_name, psu_type, valid_until, created_at)
		 VALUES ('test-session', ?, 'personal', '2099-01-01', datetime('now'))`
	).run(aspspName);

	const sessionId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

	db.prepare(
		`INSERT INTO accounts (session_id, account_uid, aspsp_name, name, currency)
		 VALUES (?, ?, ?, ?, ?)`
	).run(sessionId, `uid-${Date.now()}-${Math.random()}`, aspspName, accountName, currency);

	return (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
}

interface TxOptions {
	amount?: string;
	creditDebit?: 'DBIT' | 'CRDT';
	status?: 'booked' | 'pending' | 'unconfirmed' | 'opening_balance';
	bookingDate?: string;
	payee?: string;
}

export function seedTransaction(
	db: Database.Database,
	accountId: number,
	opts: TxOptions = {}
): number {
	const {
		amount = '10.00',
		creditDebit = 'DBIT',
		status = 'booked',
		bookingDate = '2026-03-01',
		payee = 'Test Payee'
	} = opts;

	db.prepare(
		`INSERT INTO transactions (account_id, booking_date, amount, currency, credit_debit_indicator, status, payee)
		 VALUES (?, ?, ?, 'GBP', ?, ?, ?)`
	).run(accountId, bookingDate, amount, creditDebit, status, payee);

	return (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
}

export function seedEnvelope(
	db: Database.Database,
	accountId: number,
	name = 'Groceries'
): number {
	db.prepare(`INSERT INTO envelopes (account_id, name) VALUES (?, ?)`).run(accountId, name);
	return (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
}
