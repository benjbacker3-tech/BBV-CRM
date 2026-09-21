import { NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

// Sandpiper Capital Acquisition Pipeline — sourced from Acq Pipeline - 09 16 2026.xlsx
// Active LOI + PSA deals only (9 total). Everything else was wiped.
//
// Stage mapping:
//   xlsx "PSA"              → 'Under Contract'
//   xlsx "Agreed to Terms"  → 'Negotiating PSA'
//   xlsx "LOI Tracking"     → 'LOI Submitted'
//
// Partner notes taken from CentrePoint / Aasif sub-tabs.
const DEALS = [
  // ─── PSA ─────────────────────────────────────────────────────────────────
  {
    address: '10275 E 106th', city: 'Denver', market: 'Denver',
    sf: 20000, acreage: 2.05, occupancy: 1,
    asking_price: 4000000, yoc_initial: 0.0732, yoc_target: 0.077, equity_required: 1404266,
    stage: 'Under Contract', dd_days: 45, close_days: 30, deposit: null,
    notes: 'PSA executed. CentrePoint partner deal. Underwritten 4Y IRR ~22.5%, EM 2.1x. All-in basis $4.68M.',
  },
  {
    address: '1962 Ives', city: 'Kent', market: 'Seattle',
    sf: 34000, acreage: 4.4, occupancy: 0,
    asking_price: 6500000, yoc_initial: 0, yoc_target: 0.0835, equity_required: 3111111,
    stage: 'Under Contract', dd_days: 45, close_days: 30, deposit: null,
    notes: 'PSA executed. CentrePoint partner deal. Underwritten 4Y IRR ~22.7%, EM 2.19x. All-in basis $10.37M.',
  },

  // ─── Agreed to Terms → Negotiating PSA ───────────────────────────────────
  {
    address: '5555 Dahlia', city: 'Commerce City', market: 'Denver',
    sf: 25000, acreage: 4.12, occupancy: 0,
    asking_price: 5150000, yoc_initial: 0, yoc_target: 0.084, equity_required: 2556161,
    stage: 'Negotiating PSA', dd_days: 45, close_days: 30, deposit: null,
    notes: 'Terms agreed with seller; PSA in drafting. CentrePoint partner deal. Underwritten 4Y IRR ~19.4%, EM 1.98x. All-in basis $7.30M.',
  },

  // ─── LOI Tracking ────────────────────────────────────────────────────────
  {
    address: '8100 Dahlia', city: 'Denver', market: 'Denver',
    sf: 46700, acreage: 16, occupancy: 1,
    asking_price: 18000000, yoc_initial: 0, yoc_target: 0.084, equity_required: 7504446,
    stage: 'LOI Submitted', dd_days: 60, close_days: 30, deposit: null,
    notes: 'Equipment Shop. CentrePoint partner deal. All-in basis $21.4M. Returns TBD.',
  },
  {
    address: '1901 Taylor', city: 'Tacoma', market: 'Seattle',
    sf: 77000, acreage: 8.3, occupancy: 1,
    asking_price: 25000000, yoc_initial: 0, yoc_target: 0, equity_required: 8374541,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: 20000,
    notes: 'Aasif partner deal. Underwritten 5Y IRR ~11.4%, EM 1.88x. All-in basis $28M.',
  },
  {
    address: '3033 Losee', city: 'Las Vegas', market: 'Las Vegas',
    sf: 17000, acreage: 4.06, occupancy: 1,
    asking_price: 11000000, yoc_initial: 0, yoc_target: 0, equity_required: 3119986,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: 20000,
    notes: 'Aasif partner deal (Aasif tab shows $12M price). Underwritten 5Y IRR ~9.8-11.2%, EM 1.5-1.88x. All-in basis $12.48M.',
  },
  {
    address: '2511 Inter', city: 'Puyallup', market: 'Seattle',
    sf: 7000, acreage: 1.86, occupancy: 1,
    asking_price: 3500000, yoc_initial: 0, yoc_target: 0, equity_required: 1410570,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: 20000,
    notes: 'Equipment Shop. On both CentrePoint and Aasif watchlists (Aasif shows $4M price). All-in basis $4.03M. Returns TBD.',
  },
  {
    address: 'Equipment Shop — Tacoma', city: 'Tacoma', market: 'Seattle',
    sf: 7000, acreage: 1.48, occupancy: 1,
    asking_price: 3400000, yoc_initial: 0, yoc_target: 0, equity_required: 1361479,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: null,
    notes: 'CentrePoint partner deal. All-in basis $3.89M. Returns TBD.',
  },
  {
    address: 'Equipment Shop — Denver', city: 'Denver', market: 'Denver',
    sf: 12000, acreage: 5, occupancy: 1,
    asking_price: 6500000, yoc_initial: 0, yoc_target: 0, equity_required: 2068714,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: null,
    notes: 'CentrePoint partner deal. All-in basis $5.91M. Returns TBD.',
    ownership_pct: 100,
  },

  // ─── Closed (Owned Asset) ────────────────────────────────────────────────
  {
    address: '6371 Nesbitt', city: 'Madison', market: 'Wisconsin',
    sf: 25000, acreage: 11.1, occupancy: 0,
    asking_price: 3600000, yoc_initial: 0, yoc_target: 0.108, equity_required: 2343106,
    stage: 'Closed', dd_days: 60, close_days: 30, deposit: 50000,
    notes: 'Closed. SPC owns 18%. Larger site with two shops and multiple access points.',
    ownership_pct: 18,
  },
];

// POST /api/seed-pipeline
// Wipes deals/contacts/tasks/contact_log/diligence/diligence_items/activity_log
// and reloads with the 09/16/2026 active pipeline (LOI + PSA only).
// Idempotent — safe to call multiple times.
// Investors, capital_sources, and market_snapshots are preserved.
export async function POST() {
  // Wipe — order matters because of foreign keys
  await run('DELETE FROM tasks');
  await run('DELETE FROM contact_log');
  await run('DELETE FROM diligence_items');
  await run('DELETE FROM diligence');
  await run('DELETE FROM contacts');
  await run('DELETE FROM activity_log');
  await run('DELETE FROM deals');

  // Reset auto-increment so the No. column starts at 1
  await run("DELETE FROM sqlite_sequence WHERE name IN ('deals','contacts','tasks','contact_log','diligence','diligence_items','activity_log')");

  const inserted: { id: number; address: string }[] = [];
  for (const d of DEALS) {
    const result = await run(
      `INSERT INTO deals (
         name, address, city, market, submarket,
         sf, acreage, occupancy,
         asking_price, yoc_initial, yoc_target, equity_required,
         zoning, ios_eligible, stage, source,
         dd_expiry, dd_days, close_days, deposit, notes, ownership_pct
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.address, d.address, d.city, d.market, null,
        d.sf, d.acreage, d.occupancy,
        d.asking_price, d.yoc_initial, d.yoc_target, d.equity_required,
        null, 1, d.stage, 'Pipeline import 09/16/2026',
        null, d.dd_days, d.close_days, d.deposit, d.notes,
        (d as { ownership_pct?: number }).ownership_pct ?? 100,
      ]
    );
    await logActivity({
      entity_type: 'deal',
      entity_id: Number(result.lastInsertRowid),
      action: 'created',
      description: `Deal "${d.address}" loaded from Sandpiper Capital pipeline`,
    });
    inserted.push({ id: Number(result.lastInsertRowid), address: d.address });
  }

  return NextResponse.json({ wiped: true, inserted, total: DEALS.length });
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to RESET the pipeline (wipes all deals + activity, then loads the 9 active LOI/PSA deals from Acq Pipeline - 09 16 2026.xlsx)',
    deals: DEALS.map(d => ({ address: d.address, market: d.market, stage: d.stage })),
  });
}
