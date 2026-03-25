# Split Redesign — Design Doc

**Date:** 2026-03-25

## Overview

Move split creation responsibility from the web app to the sync tool, and redesign the split editing UX from a batch "define all parts upfront" model to an incremental "add one split at a time" model.

---

## Motivation

- Split creation is a consequence of transaction creation. The sync tool creates transactions, so it should also create the initial splits.
- The current `resetSplits` / `saveSplits` pattern requires the web to clean up DB state on cancel, which complicates the flow. The new model avoids that entirely.
- Round-up splits should only apply from the date the feature is enabled — not back-filled onto past transactions, and not cleaned up when disabled.

---

## Schema Changes

Rework migration `0003_round_up.sql` (branch hasn't merged) to:

- Replace `round_up INTEGER NOT NULL DEFAULT 0` on `accounts` with `round_up_since TEXT` (nullable ISO date).
  - `NULL` = round-up disabled
  - A date = round-up enabled since that date; only transactions on or after this date get a round-up split.
- Add `is_default INTEGER NOT NULL DEFAULT 0` on `splits`.
  - `is_default = 1` marks the one uncancelable split that sync creates for each transaction.
  - `is_round_up = 1` (existing column) marks the auto-created round-up split.
  - User-defined splits have both as 0.

---

## Sync (Python)

Add to `sync/db.py`:

- `get_or_create_round_up_envelope(conn, account_id)` — idempotent, creates/fetches the "Round Up" envelope.
- `ensure_default_split(conn, tx_id)` — if no default split exists, insert one for the full transaction amount with `is_default = 1`. Idempotent.
- `ensure_round_up_split(conn, tx_id)` — if `account.round_up_since IS NOT NULL` and `tx.date >= round_up_since` and the transaction is a DBIT with a non-whole amount, insert a round-up split and auto-allocate it to the Round Up envelope. Idempotent.

Update `sync/sync.py`: after each `upsert_transaction`, call `ensure_default_split` then `ensure_round_up_split`.

Update `sync/models.py`: add `round_up_since: Optional[date]` to `Account`.

Update `sync/db.py`: include `round_up_since` in account reads/writes.

**Tests** (`tests/test_splits.py`, new file):
- `ensure_default_split`: creates split, idempotent, doesn't overwrite existing
- `ensure_round_up_split`: correct amount, auto-allocated, whole amounts skipped, CRDT skipped, date gate respected, idempotent
- `get_or_create_round_up_envelope`: creates, idempotent, separate per account
- Integration: sync creates default + round-up splits end-to-end

---

## Web — Queries (`queries.ts`)

**Remove:**
- `ensureDefaultSplit` (moved to Python)
- `ensureRoundUpSplit` (moved to Python)
- `getOrCreateRoundUpEnvelope` (moved to Python)
- `saveSplits`
- `resetSplits`
- The `ensureDefaultSplit` side-effect call inside `getUnallocatedTransactions`

**Add:**
- `createSplit(txId, amount, note?)` — inserts a new non-default split, reduces the default split's amount by that amount. Validates that amount < default split amount and amount > 0.
- `deleteSplit(splitId)` — deletes a non-default split, adds its amount back to the default split. Rejects attempts to delete the default split.

**Update:**
- `setAccountRoundUp(accountId, enabledSince: string | null)` — sets `round_up_since` to the provided date string or NULL. No back-fill or cleanup needed.

---

## Web — Server Actions

**Remove:** `save_splits`, `resetSplits`, `cancel` (on split page and account page).

**Add to account page (`+page.server.ts`):**
- `create_split`: reads `txId`, `amount`, `note` from form data, calls `createSplit`, redirects back.
- `delete_split`: reads `splitId` from form data, calls `deleteSplit`, redirects back.

**Update:**
- `toggle_round_up`: passes today's date when enabling, NULL when disabling. Removes back-fill loop.

**Remove:** `/accounts/[accountId]/split` route and page entirely.

---

## Web — UI

The account page dock (transaction detail at bottom of screen) replaces the separate split page:

- **Default split row**: labelled with a "Default" indicator. Shows its current amount. Has a **Split** button that opens an inline form asking for amount and optional note.
- **Non-default split rows**: show amount and note. Have a **Delete** button. Show envelope allocation UI if unallocated (same as today).
- After creating a split, the new split appears immediately as unallocated, ready to allocate to an envelope.
- The default split is also allocatable — it shows the envelope picker when unallocated.

---

## What Doesn't Change

- `allocateSplit` — unchanged
- `getSplitsWithStatus` — unchanged (already filters `is_round_up = 0`)
- `getUnallocatedTransactions` — query unchanged, just remove the `ensureDefaultSplit` side-effect call
- `getOrCreateRoundUpEnvelope` in web — referenced by `setAccountRoundUp` to ensure envelope exists on enable; keep as a private helper
- Round-up toggle UI on the account page — unchanged except the server action passes a date instead of a boolean

---

## Migration Strategy

Since `0003_round_up.sql` is on a feature branch that hasn't merged to main, edit it in place rather than adding a fourth migration. Any local DBs will need to be recreated (run `migrate.py` against a fresh DB).
