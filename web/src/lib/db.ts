import Database from 'better-sqlite3';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!_db) {
		const path = process.env.DB_PATH;
		if (!path) throw new Error('DB_PATH environment variable is not set');
		_db = new Database(path);
		_db.pragma('foreign_keys = ON');
		_db.pragma('journal_mode = WAL');
	}
	return _db;
}

/**
 * Retry a synchronous DB operation on SQLITE_BUSY, up to 3 times with 50ms backoff.
 */
export function withRetry<T>(fn: () => T): T {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return fn();
		} catch (err) {
			const e = err as { code?: string };
			if (e?.code === 'SQLITE_BUSY') {
				lastError = err;
				// Synchronous sleep — only used for SQLITE_BUSY which is rare
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
			} else {
				throw err;
			}
		}
	}
	throw lastError;
}
