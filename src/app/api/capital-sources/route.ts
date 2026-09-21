import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';

// GET /api/capital-sources — list all capital partners (JV equity, HNW, LOC).
// POST /api/capital-sources — create a new one.

export async function GET() {
  const rows = await all('SELECT * FROM capital_sources ORDER BY created_at ASC');
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const result = await run(
    `INSERT INTO capital_sources (
       name, short_name, kind, status, primary_contact, headquarters, target_size,
       pref_pct, promote_summary, geo_focus, strategy_fit,
       sponsor_skin_pct, asset_mgmt_fee_pct, acq_fee_pct, loan_rate_pct,
       leverage_target_pct, hold_period, exclusivity_notes, signed_date, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.name, b.short_name ?? null, b.kind ?? null, b.status ?? null,
      b.primary_contact ?? null, b.headquarters ?? null, b.target_size ?? null,
      b.pref_pct ?? null, b.promote_summary ?? null, b.geo_focus ?? null, b.strategy_fit ?? null,
      b.sponsor_skin_pct ?? null, b.asset_mgmt_fee_pct ?? null, b.acq_fee_pct ?? null, b.loan_rate_pct ?? null,
      b.leverage_target_pct ?? null, b.hold_period ?? null, b.exclusivity_notes ?? null, b.signed_date ?? null, b.notes ?? null,
    ]
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
