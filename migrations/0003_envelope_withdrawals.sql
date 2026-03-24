CREATE TABLE IF NOT EXISTS envelope_withdrawals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id       INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    from_envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    to_envelope_id   INTEGER REFERENCES envelopes(id) ON DELETE SET NULL,
    amount           TEXT    NOT NULL,
    note             TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK(from_envelope_id != COALESCE(to_envelope_id, -1))
);

CREATE INDEX IF NOT EXISTS idx_envelope_withdrawals_account_id    ON envelope_withdrawals(account_id);
CREATE INDEX IF NOT EXISTS idx_envelope_withdrawals_from_envelope ON envelope_withdrawals(from_envelope_id);
CREATE INDEX IF NOT EXISTS idx_envelope_withdrawals_to_envelope   ON envelope_withdrawals(to_envelope_id);
