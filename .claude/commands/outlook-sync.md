---
description: Scan Outlook (ben@sandpiperre.com) for deal updates and apply them to the CRM
argument-hint: "[since date, e.g. 2026-09-21 — defaults to the latest snapshot's as_of]"
---

Update the CRM from Outlook. Outlook is **read-only** here: never send, draft, move or delete mail.

1. **Find the starting point.** The latest file in `sync/` (`outlook-YYYY-MM-DD.json`) is the last snapshot. Scan from its `as_of` date, or from `$ARGUMENTS` if one is given. Read that file: it holds the deal keys, contacts and open tasks you are updating.

2. **Read the mail.** Use the Microsoft 365 connector (`outlook_email_search` + `read_resource`, and `outlook_calendar_search` for upcoming dates). Cover Inbox, Sent Items and the other folders:
   - Search each active deal by address and by its key parties.
   - Then sweep new mail for anything else deal-related: brokers, lenders, title, GCs.
   - Skip personal mail and newsletters.

3. **Write a new snapshot** to `sync/outlook-<today>.json`, using the same schema as the previous one:
   - `deals[]`: `key` (the address prefix the CRM matches on), optional `aliases`, `insert_only` for new pipeline deals, and `fields`. Only real columns go in `fields`: stage, dd_expiry, close_date, deposit, asking_price, sf, acreage, city, market, dd_days, close_days. `status[]` holds 3–6 bullets written as current state, meaning status, what Ben owes, what's pending from others, and risks. Stage must be one of: Tracking, LOI Submitted, Negotiating PSA, Under Contract, Closed, Dead. Deals under construction stay `Closed`, with "CONSTRUCTION" in their status.
   - `contacts[]`: only new people or changed details. `type` is `broker` / `owner`, or omitted for anyone else; if omitted, put the person's role in `notes`.
   - `tasks[]`: things Ben owes, tied to a contact by `contact_email`. Each has a `due_date` and a `type` of call / email / coffee.
   - `contact_log[]`: meaningful touchpoints since the last snapshot.
   - `diligence[]`: deal + category (site / env / pca / survey / roof / contractor / zoning), vendor, and `items` as [label, pending|in-progress|complete].
   - `comps[]`: lease comps, sale comps and availabilities from broker emails: blasts, flyers, OMs, comp sheets and availability lists. Read attached PDFs and flyers with `read_resource`; take figures from the document, not the subject line.
     - Only properties in Ben's markets. Set `market` to one of: Seattle, Denver, Phoenix, Salt Lake City, Las Vegas, SF, IE, LA. Use Terminals for truck terminals (cross-docks with doors). Skip anything outside these markets.
     - `kind`: `lease` (signed lease), `sale` (closed or pending trade) or `availability` (listed for lease, with an asking rent).
     - Fields: `address`, `city`, `submarket`, `comp_date` (lease start or sale close, YYYY-MM-DD), `available_date` (listings), `status` (e.g. Pending), `landlord`, `tenant`, `buyer`, `seller`, `property_type` (Equipment / Trailer / Contractor / Maintenance / Terminal), `sf` (building SF), `acres`, `price` (sales), `bumps` (decimal, 0.035), `term_months`, `broker` ("Firm - Name"), `zoning`, `yard`, `fence`, `lit`, `doors`, `depth`, `occupancy_note` (sales: Vacant / Less than 1Y / leased to X), `marketing` (Off Market / Fully Marketed), `notes`.
     - Rent goes in `rent_monthly` as **total $ per month**. Convert when the email quotes a rate: $/SF/yr on the building → rate × SF ÷ 12; $/land SF/mo → rate × acres × 43,560; $/acre/mo → rate × acres. If acres are unknown, put the $/land SF/mo rate in `rent_plf` instead. NNN goes in `nnn_plf` ($/land SF/mo).
     - `message_id` (Outlook id) and `source_note` (one line, e.g. "CBRE availability blast 9/30 — Dragan"). Plain numbers only; null when not stated.
     - These always land in the Comps **To Review** queue; Ben accepts or rejects them there. Don't hold back a comp because it might already exist: the script skips duplicates.
   - Cite dates from the emails. Flag anything inferred with "(inferred)", and never invent numbers.

4. **Preview:** `node scripts/outlook-sync.mjs sync/outlook-<today>.json --dry-run`. Show Ben the changes, especially stage changes, the comps queued for review, and anything the preview skipped.

5. **After Ben confirms, apply:** `node scripts/outlook-sync.mjs sync/outlook-<today>.json`. This writes to `TURSO_DATABASE_URL` from `.env.local`; if that isn't set, it writes to the local `sandpiper.db`.

6. **Commit the snapshot file:** `git add sync/ && git commit -m "Outlook sync <today>"`.
