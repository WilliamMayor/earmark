CREATE TABLE IF NOT EXISTS envelope_withdrawals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    from_envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    to_envelope_id   INTEGER REFERENCES envelopes(id) ON DELETE SET NULL,
    amount           TEXT    NOT NULL,
    note             TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_envelope_withdrawals_from ON envelope_withdrawals(from_envelope_id);
CREATE INDEX IF NOT EXISTS idx_envelope_withdrawals_to   ON envelope_withdrawals(to_envelope_id);
