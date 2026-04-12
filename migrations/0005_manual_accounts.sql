PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE accounts_new (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    lunchflow_id     INTEGER UNIQUE,
    name             TEXT,
    institution_name TEXT,
    currency         TEXT NOT NULL,
    last_synced_at   TEXT,
    round_up_since   TEXT
);

INSERT INTO accounts_new (id, lunchflow_id, name, institution_name, currency, last_synced_at, round_up_since)
    SELECT id, lunchflow_id, name, institution_name, currency, last_synced_at, round_up_since
    FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

COMMIT;

PRAGMA foreign_keys = ON;
