---
description: Scan Outlook (ben@sandpiperre.com) for deal updates and apply them to the CRM
argument-hint: "[since date, e.g. 2026-09-21 — defaults to the latest snapshot's as_of]"
---

Update the CRM from Outlook. Outlook is **read-only** here: never send, draft, move or delete mail.

1. **Find the starting point.** The latest file in `sync/` (`outlook-YYYY-MM-DD.json`) is the last snapshot. Scan from its `as_of` date, or from `$ARGUMENTS` if one is given. Read that file: it holds the deal keys, contacts and open tasks you are updating.

2. **Read the mail.** Use the Microsoft 365 connector (`outlook_email_search` + `read_resource`, and `outlook_calendar_search` for upcoming dates). Cover Inbox, Sent Items and the other folders:
   - Search each active deal by address and by its key parties.
   - Then sweep new mail for anything else deal-related: LOIs, brokers, lenders, title, GCs.
   - Skip personal mail and newsletters.

3. **Write a new snapshot** to `sync/outlook-<today>.json`, using the same schema as the previous one:
   - `deals[]`: `key` (the address prefix the CRM matches on), optional `aliases`, `insert_only` for new pipeline deals, and `fields`. Only real columns go in `fields`: stage, dd_expiry, close_date, deposit, asking_price, sf, acreage, city, market, dd_days, close_days. `status[]` holds 3–6 bullets written as current state, meaning status, what Ben owes, what's pending from others, and risks. Stage must be one of: Tracking, LOI Submitted, Negotiating PSA, Under Contract, Closed, Dead. Deals under construction stay `Closed`, with "CONSTRUCTION" in their status.
   - `contacts[]`: only new people or changed details. `type` is `broker` / `owner`, or omitted for anyone else; if omitted, put the person's role in `notes`.
   - `tasks[]`: things Ben owes, tied to a contact by `contact_email`. Each has a `due_date` and a `type` of call / email / coffee.
   - `contact_log[]`: meaningful touchpoints since the last snapshot.
   - `diligence[]`: deal + category (site / env / pca / survey / roof / contractor / zoning), vendor, and `items` as [label, pending|in-progress|complete].
   - Cite dates from the emails. Flag anything inferred with "(inferred)", and never invent numbers.

4. **Preview:** `node scripts/outlook-sync.mjs sync/outlook-<today>.json --dry-run`. Show Ben the changes, especially stage changes and anything the preview skipped.

5. **After Ben confirms, apply:** `node scripts/outlook-sync.mjs sync/outlook-<today>.json`. This writes to `TURSO_DATABASE_URL` from `.env.local`; if that isn't set, it writes to the local `sandpiper.db`.

6. **Commit the snapshot file:** `git add sync/ && git commit -m "Outlook sync <today>"`.
