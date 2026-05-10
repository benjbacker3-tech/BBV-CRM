import { NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

// MCI Acquisition Pipeline — sourced from Acq Pipeline - 05 04 2026.xlsx
// 7 active deals + 1 tracked (3302 A St)
const DEALS = [
  // Negotiating PSA
  {
    address: '6371 Nesbitt', city: 'Madison', market: 'Wisconsin',
    sf: 25000, acreage: 11.1, occupancy: 0,
    asking_price: 3600000, yoc_initial: 0, yoc_target: 0.108, equity_required: 2343105.6,
    stage: 'Negotiating PSA', dd_days: 60, close_days: 30, deposit: 50000,
    notes: 'BB reviewing second round of PSA comments; Barnes (neighbor) has submitted RFP to purchase or lease southern 4AC',
  },
  // LOI Submitted (6 deals)
  {
    address: '4002 Clay', city: 'Englewood', market: 'Denver',
    sf: 25000, acreage: 4.2, occupancy: 1,
    asking_price: 5200000, yoc_initial: 0.07, yoc_target: 0.0872, equity_required: 2880000,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: 20000,
    notes: 'Up to 3Y leaseback; demo lower clear section to create two high-clear shops',
  },
  {
    address: '6829 S Dawson', city: 'Centennial', market: 'Denver',
    sf: 18000, acreage: 2.88, occupancy: 1,
    asking_price: 5500000, yoc_initial: 0.075, yoc_target: 0.083, equity_required: 2495200,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: 25000,
    notes: 'Less than 1Y remaining, Seller\'s business went BK and needs to liquidate real estate assets; potential to acquire next door site as well',
  },
  {
    address: '4840 Wyoming', city: 'Dearborn', market: 'Detroit',
    sf: 60000, acreage: 8.64, occupancy: 1,
    asking_price: 5000000, yoc_initial: 0.08, yoc_target: 0.099, equity_required: 2213160,
    stage: 'LOI Submitted', dd_days: 60, close_days: 40, deposit: 10000,
    notes: 'Truck and trailer repair business with two functional shops; Half of family wants to sell, other half evaluating',
  },
  {
    address: '6215 Colorado', city: 'Commerce City', market: 'Denver',
    sf: 13000, acreage: 5.1, occupancy: 1,
    asking_price: 4500000, yoc_initial: 0.0625, yoc_target: 0.084, equity_required: 2200000,
    stage: 'LOI Submitted', dd_days: 45, close_days: 30, deposit: 100000,
    notes: '3Y leaseback with Suncor; Corporate team approved relocation, awaiting updated LOI response in June / July',
  },
  {
    address: '7650 Melville', city: 'Detroit', market: 'Detroit',
    sf: 9447, acreage: 8.33, occupancy: 1,
    asking_price: 4000000, yoc_initial: 0.079, yoc_target: 0.0952, equity_required: 1887534.8,
    stage: 'LOI Submitted', dd_days: 60, close_days: 40, deposit: 10000,
    notes: '3Y leaseback of container yard adjacent to Gordie Howe International Bridge',
  },
  {
    address: '4011 Lonyo', city: 'Detroit', market: 'Detroit',
    sf: 20081, acreage: 4.98, occupancy: 1,
    asking_price: 2500000, yoc_initial: 0.1, yoc_target: 0.115, equity_required: 1360000,
    stage: 'LOI Submitted', dd_days: 60, close_days: 40, deposit: 10000,
    notes: 'Truck maintenance facility with 3-5Y leaseback',
  },
  // Tracking (orphan row at bottom)
  {
    address: '3302 A St', city: 'Auburn', market: 'Seattle / Tacoma',
    sf: 3750, acreage: 0.86, occupancy: 0,
    asking_price: 1530000, yoc_initial: 0, yoc_target: 0.1, equity_required: 732000,
    stage: 'Tracking', dd_days: 60, close_days: 30, deposit: 10000,
    notes: 'Drive through maintenance building; owner has put his equipment up for auction',
  },
];

// POST /api/seed-pipeline
// Wipes deals/contacts/tasks/contact_log/diligence/diligence_items/activity_log
// and reloads with the 8 deals above. Idempotent — safe to call multiple times.
// Investors and market_snapshots are preserved.
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
         dd_expiry, dd_days, close_days, deposit, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.address, d.address, d.city, d.market, null,
        d.sf, d.acreage, d.occupancy,
        d.asking_price, d.yoc_initial, d.yoc_target, d.equity_required,
        null, 1, d.stage, 'Pipeline import',
        null, d.dd_days, d.close_days, d.deposit, d.notes,
      ]
    );
    await logActivity({
      entity_type: 'deal',
      entity_id: Number(result.lastInsertRowid),
      action: 'created',
      description: `Deal "${d.address}" loaded from MCI pipeline`,
    });
    inserted.push({ id: Number(result.lastInsertRowid), address: d.address });
  }

  return NextResponse.json({ wiped: true, inserted, total: DEALS.length });
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to RESET the pipeline (wipes existing deals/contacts/activity, then loads the 8 MCI deals)',
    deals: DEALS.map(d => ({ address: d.address, market: d.market, stage: d.stage })),
  });
}
