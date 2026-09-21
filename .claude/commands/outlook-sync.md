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
   - `lois[]`: one entry for **every LOI Ben sent**. To find them:
     - Search sender `ben@sandpiperre.com` with the queries "LOI", "Letter of Intent", "revised LOI" and "updated LOI".
     - Also check Sent Items for any attachment named `*LOI*`.
     - Read the **attachment itself** with `read_resource` on the attachment URI. Take the terms from the letter, not from the email subject.
     - Fields: `deal` (short key like "2808 N 27th"), optional `aliases`, `property` (the address as written in the letter), `city`, `market`, `sent_date`, `attachment_name`, `to_name`, `to_email`, `to_firm`, `price`, `sf`, `acreage`, `deposit`, `dd_days`, `close_days` (days after DD), `exclusivity_days`, `leaseback`, `other_terms`, `version_note`, `message_id` (the Outlook id; this is the key that prevents duplicates), `confidence` (high / medium / low) and `notes`.
     - Plain numbers only; use null when the letter doesn't state a term.
     - A revision of an existing LOI goes in as a new entry, with `version_note` saying what changed.
     - Mark `confidence: "low"` when the file name, subject and letter disagree on the property. The script skips these until Ben confirms them.
     - A fully executed or countersigned LOI that Ben forwards also counts; note that in `version_note`.
   - `diligence[]`: deal + category (site / env / pca / survey / roof / contractor / zoning), vendor, and `items` as [label, pending|in-progress|complete].
   - Cite dates from the emails. Flag anything inferred with "(inferred)", and never invent numbers.

4. **Preview:** `node scripts/outlook-sync.mjs sync/outlook-<today>.json --dry-run`. Show Ben the changes, especially stage changes, new LOIs with their price, SF and acres, and anything the preview skipped, such as low-confidence LOIs.

5. **After Ben confirms, apply:** `node scripts/outlook-sync.mjs sync/outlook-<today>.json`. This writes to `TURSO_DATABASE_URL` from `.env.local`; if that isn't set, it writes to the local `sandpiper.db`.

6. **Commit the snapshot file:** `git add sync/ && git commit -m "Outlook sync <today>"`.
