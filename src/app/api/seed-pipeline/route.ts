import { NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

// The 8 deals from Acq Pipeline - 04 13 2026.xlsx
const DEALS = [
  // Signed LOI
  {
    name: '6371 Nesbitt',
    address: '6371 Nesbitt',
    city: 'Madison',
    market: 'Wisconsin',
    sf: 50000,
    acreage: 12.22,
    occupancy: 0,
    asking_price: 3600000,
    yoc_initial: 0,
    yoc_target: 0.107,
    equity_required: 2343105.6,
    stage: 'Signed LOI',
    dd_days: 60,
    close_days: 30,
    deposit: 50000,
    notes: 'Larger site with two shops and multiple access points; divides well for two or three tenant scenario',
  },
  // LOI Submitted
  {
    name: '3825 Losee',
    address: '3825 Losee',
    city: 'North Las Vegas',
    market: 'Las Vegas',
    sf: 13000,
    acreage: 3.5,
    occupancy: 1,
    asking_price: 6200000,
    yoc_initial: 0.06,
    yoc_target: 0.09,
    equity_required: 2680000,
    stage: 'LOI Submitted',
    dd_days: 45,
    close_days: 30,
    deposit: 100000,
    notes: 'Fully leased to Komatsu with upcoming FMV renewal',
  },
  {
    name: '4840 Wyoming',
    address: '4840 Wyoming',
    city: 'Dearborn',
    market: 'Detroit',
    sf: 60000,
    acreage: 8.64,
    occupancy: 1,
    asking_price: 5000000,
    yoc_initial: 0.08,
    yoc_target: 0.099,
    equity_required: 2213160,
    stage: 'LOI Submitted',
    dd_days: 60,
    close_days: 40,
    deposit: 10000,
    notes: 'Truck and trailer repair business with two functional shops; TBD leaseback based on Seller feedback',
  },
  {
    name: '6215 Colorado',
    address: '6215 Colorado',
    city: 'Commerce City',
    market: 'Denver',
    sf: 13000,
    acreage: 5.1,
    occupancy: 1,
    asking_price: 4500000,
    yoc_initial: 0.0625,
    yoc_target: 0.084,
    equity_required: 2200000,
    stage: 'LOI Submitted',
    dd_days: 45,
    close_days: 30,
    deposit: 100000,
    notes: '3Y leaseback with Suncor, working through new site rennovation before signing LOI',
  },
  {
    name: '7650 Melville',
    address: '7650 Melville',
    city: 'Detroit',
    market: 'Detroit',
    sf: 9447,
    acreage: 8.33,
    occupancy: 1,
    asking_price: 4000000,
    yoc_initial: 0.079,
    yoc_target: 0.0952,
    equity_required: 1887534.8,
    stage: 'LOI Submitted',
    dd_days: 60,
    close_days: 40,
    deposit: 10000,
    notes: '3Y leaseback of container yard adjacent to Gordie Howe International Bridge',
  },
  {
    name: '4011 Lonyo',
    address: '4011 Lonyo',
    city: 'Detroit',
    market: 'Detroit',
    sf: 20081,
    acreage: 4.98,
    occupancy: 1,
    asking_price: 2500000,
    yoc_initial: 0.1,
    yoc_target: 0.115,
    equity_required: 1360000,
    stage: 'LOI Submitted',
    dd_days: 60,
    close_days: 40,
    deposit: 10000,
    notes: 'Truck mainteance facility with 3-5Y leaseback',
  },
  {
    name: '2147 Adobe',
    address: '2147 Adobe',
    city: 'Phoenix',
    market: 'Phoenix',
    sf: 5500,
    acreage: 2.06,
    occupancy: 0,
    asking_price: 2400000,
    yoc_initial: 0,
    yoc_target: 0.085,
    equity_required: 1120000,
    stage: 'LOI Submitted',
    dd_days: 45,
    close_days: 30,
    deposit: 100000,
    notes: 'Newly constructed shop; business owner working on 1031 downleg',
  },
  // Tracking (orphaned row at bottom of spreadsheet — no section header)
  {
    name: '3302 A St',
    address: '3302 A St',
    city: 'Auburn',
    market: 'Seattle / Tacoma',
    sf: 3750,
    acreage: 0.86,
    occupancy: 0,
    asking_price: 1530000,
    yoc_initial: 0,
    yoc_target: 0.1,
    equity_required: 732000,
    stage: 'Tracking',
    dd_days: 60,
    close_days: 30,
    deposit: 10000,
    notes: 'Drive through mainteance building; owner has put his equipment up for auction',
  },
];

export async function POST() {
  const inserted: { id: number; name: string }[] = [];
  const skipped: string[] = [];

  for (const d of DEALS) {
    // Skip if a deal with this address already exists (idempotent)
    const existing = await get('SELECT id FROM deals WHERE address = ?', [d.address]);
    if (existing) {
      skipped.push(d.address);
      continue;
    }
    const result = await run(
      `INSERT INTO deals (
         name, address, city, market, submarket,
         sf, acreage, occupancy,
         asking_price, yoc_initial, yoc_target, equity_required,
         zoning, ios_eligible, stage, source,
         dd_expiry, dd_days, close_days, deposit, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.name, d.address, d.city, d.market, null,
        d.sf, d.acreage, d.occupancy,
        d.asking_price, d.yoc_initial, d.yoc_target, d.equity_required,
        null, 1, d.stage, 'Pipeline import',
        null, d.dd_days, d.close_days, d.deposit, d.notes,
      ]
    );
    await logActivity({ entity_type: 'deal', entity_id: result.lastInsertRowid, action: 'created', description: `Deal "${d.name}" imported from pipeline` });
    inserted.push({ id: result.lastInsertRowid, name: d.name });
  }

  return NextResponse.json({ inserted, skipped, total: DEALS.length });
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to import the 8 pipeline deals',
    deals: DEALS.map(d => ({ address: d.address, market: d.market, stage: d.stage })),
  });
}
