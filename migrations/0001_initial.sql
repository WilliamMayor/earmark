CREATE TABLE IF NOT EXISTS accounts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    lunchflow_id     INTEGER NOT NULL UNIQUE,
    name             TEXT,
    institution_name TEXT,
    currency         TEXT NOT NULL,
    last_synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id             INTEGER NOT NULL REFERENCES accounts(id),
    lunchflow_id           TEXT,
    date                   TEXT,
    amount                 TEXT NOT NULL,
    currency               TEXT NOT NULL,
    credit_debit_indicator TEXT NOT NULL CHECK(credit_debit_indicator IN ('CRDT', 'DBIT')),
    status                 TEXT NOT NULL CHECK(status IN ('booked', 'pending', 'opening_balance')),
    merchant               TEXT,
    description            TEXT,
    note                   TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_lunchflow_id
    ON transactions(lunchflow_id) WHERE lunchflow_id IS NOT NULL;
