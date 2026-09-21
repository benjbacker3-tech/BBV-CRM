# Sandpiper CRM

Institutional-quality CRM for industrial outdoor storage (IOS) real estate investment. Built for Sandpiper Partners LLC.

## Features

- **Pipeline Kanban** — 6-stage deal flow (Tracking → LOI Submitted → PSA Negotiation → Under Contract → Closed → Dead) with drag-and-drop, DD countdown chips, and pinned deals
- **Deal Detail Panel** — Overview, Contacts, Diligence tracker (7 categories), LOI generator with PDF export, Napkin Math calculator (YoC, cash-on-cash)
- **Contacts CRM** — Broker/owner tracking with warmth ratings, tasks, contact log, sortable table
- **OpenPhone Integration** — Auto-syncs calls and SMS into the contact log every 15 minutes
- **Global Search** — Cmd+K / Ctrl+K command bar across deals, contacts, and tasks
- **Activity Feed** — Live reverse-chronological feed of all actions, polled every 30s
- **Morning Email Digest** — Daily 7 AM briefing via Resend (overdue tasks, DD expirations, stale deals)
- **Dark Mode** — Full theme toggle, persisted in localStorage
- **Quick-Add FAB** — Floating + button with N/C/T keyboard shortcuts
- **Capital/Investors** — Commitment and capital-called tracking
- **Market Data** — Rates, IOS fundamentals, freight, port volumes

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- SQLite via better-sqlite3
- jsPDF for LOI export
- Resend API for email

## Setup

```bash
npm install
cp .env.local.example .env.local  # or create manually
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Create `.env.local`:

```
OPENPHONE_API_KEY=your_key_here
OPENPHONE_NUMBER_ID=PNxxxxxxx
RESEND_API_KEY=re_xxxxxxx
```

## Outlook Sync

Email-derived deal status is loaded from snapshot files in `sync/`:

```bash
node scripts/outlook-sync.mjs sync/outlook-2026-09-21.json --dry-run   # preview
node scripts/outlook-sync.mjs sync/outlook-2026-09-21.json             # apply
```

The script writes to `TURSO_DATABASE_URL` from `.env.local` (falls back to local `sandpiper.db`). It is non-destructive and safe to re-run. It updates deal fields, and your own notes are kept: only the trailing "── Email status" block is replaced. It also fills blank contact fields and de-duplicates tasks, log entries and diligence items.

**LOIs:** the snapshot's `lois[]` list holds every LOI you've emailed, with terms read from the attached letter. Each one is stored in the `lois` table, and the full history shows under **Sent LOIs** in the deal's LOI tab. The newest LOI sets the deal's price, SF, acres, deposit and DD/close days while the deal is at Tracking or LOI Submitted. For deals past that stage, it only fills blank fields. If an LOI is for a property the CRM doesn't have yet, it creates the deal at LOI Submitted.

In Claude Code, run `/outlook-sync` to scan Outlook since the last snapshot, write a new snapshot, preview it and apply it. This needs the Microsoft 365 connector.

## Deployment Notes

- SQLite does not persist on serverless (Vercel) — migrate to Turso or Postgres for production
- Morning digest requires an external cron (Vercel Cron, GitHub Actions, or Windows Task Scheduler) to POST `/api/digest` at 7 AM daily

## License

Private.
