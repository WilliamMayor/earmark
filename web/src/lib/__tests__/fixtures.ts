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
	institutionName?: string;
	accountName?: string;
	currency?: string;
}

export function seedAccount(db: Database.Database, opts: SeedOptions = {}): number {
	const { institutionName = 'Monzo', accountName = 'Personal', currency = 'GBP' } = opts;

	db.prepare(
		`INSERT INTO accounts (lunchflow_id, institution_name, name, currency)
		 VALUES (?, ?, ?, ?)`
	).run(Date.now(), institutionName, accountName, currency);

	return (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
}

interface TxOptions {
	amount?: string;
	creditDebit?: 'DBIT' | 'CRDT';
	status?: 'booked' | 'pending' | 'opening_balance';
	date?: string;
	merchant?: string;
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
		date = '2026-03-01',
		merchant = 'Test Merchant'
	} = opts;

	db.prepare(
		`INSERT INTO transactions (account_id, date, amount, currency, credit_debit_indicator, status, merchant)
		 VALUES (?, ?, ?, 'GBP', ?, ?, ?)`
	).run(accountId, date, amount, creditDebit, status, merchant);

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
