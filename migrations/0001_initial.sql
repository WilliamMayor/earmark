CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL UNIQUE,
    aspsp_name  TEXT NOT NULL,
    psu_type    TEXT NOT NULL CHECK(psu_type IN ('personal', 'business')),
    valid_until TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS accounts (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id                INTEGER NOT NULL REFERENCES sessions(id),
    account_uid               TEXT NOT NULL UNIQUE,
    aspsp_name                TEXT NOT NULL,
    name                      TEXT,
    currency                  TEXT NOT NULL,
    last_synced_at            TEXT,
    last_synced_booking_date  TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id             INTEGER NOT NULL REFERENCES accounts(id),
    entry_reference        TEXT,
    booking_date           TEXT,
    value_date             TEXT,
    amount                 TEXT NOT NULL,
    currency               TEXT NOT NULL,
    credit_debit_indicator TEXT NOT NULL CHECK(credit_debit_indicator IN ('CRDT', 'DBIT')),
    status                 TEXT NOT NULL
                               CHECK(status IN ('booked', 'pending', 'unconfirmed', 'opening_balance')),
    payee                  TEXT,
    remittance_information TEXT,
    note                   TEXT,
    raw_data               TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(account_id, entry_reference)
);
