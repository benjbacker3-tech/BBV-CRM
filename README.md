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

## Deployment Notes

- SQLite does not persist on serverless (Vercel) — migrate to Turso or Postgres for production
- Morning digest requires an external cron (Vercel Cron, GitHub Actions, or Windows Task Scheduler) to POST `/api/digest` at 7 AM daily

## License

Private.
