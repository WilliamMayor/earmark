CREATE TABLE IF NOT EXISTS envelopes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(account_id, name)
);

CREATE TABLE IF NOT EXISTS splits (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount         TEXT    NOT NULL,
    note           TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS allocations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    split_id    INTEGER NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(split_id)
);

CREATE INDEX IF NOT EXISTS idx_splits_transaction_id   ON splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_allocations_envelope_id ON allocations(envelope_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_account_id    ON envelopes(account_id)
