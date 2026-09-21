import { NextResponse } from 'next/server';
import { run } from '@/lib/db';

// POST /api/seed-capital — wipes and reloads the three capital sources
// (CenterPoint Properties, Oakwood Real Estate Partners, Aasif Bade / BFO)
// with details lifted from their signed term sheets / note.
//
// Safe to re-run: it wipes the table first.

export const dynamic = 'force-dynamic';

const SOURCES = [
  {
    name: 'CentrePoint Properties, LLC',
    short_name: 'CentrePoint',
    kind: 'JV Equity — Programmatic Facility',
    status: 'Term Sheet Signed 8/26/2026',
    primary_contact: 'Tucker Manion, CEO',
    headquarters: null,
    target_size: 'Programmatic — no committed dollar amount. Three properties in initial pipeline (Brighton CO, Tacoma WA, Kent WA).',
    pref_pct: 8,
    promote_summary:
      '8% pref pari passu → then 85/15 to 17% IRR → then 70/30 to 25% IRR → then 60/40. Multiple share classes may be needed. SPC controls the waterfall on capital SPC raises and keeps 100% of that promote.',
    geo_focus: 'Colorado + western United States (all states west of Colorado). 6-month right of first look on SPC pipeline.',
    strategy_fit: 'IOS acquisitions at ~65% LTC or less; 2–5 year hold; light value-add re-tenant / capex.',
    sponsor_skin_pct: 4, // 3-5% range
    asset_mgmt_fee_pct: 1,
    acq_fee_pct: 1.35, // to SPC (CPP also gets 1%)
    loan_rate_pct: null,
    leverage_target_pct: 65,
    hold_period: '2–5 years',
    exclusivity_notes:
      'Right of first refusal on all SPC pipeline deals for 6 months (Tail Period). 10-day review window per deal. Applies whether pursued via CentrePoint Fund 1 or the successor Canopy CRE Tactical Opportunities Fund II (launching Q4 2026).',
    signed_date: '2026-08-26',
    notes:
      'Project mgmt fee 4% of major capex; leasing fee 1% of net rent. CPP funds equity balance (acquisition + capex less financing) minus SPC principal skin. CPP contribution comes from CentrePoint Fund 1 and/or direct co-investors.',
  },
  {
    name: 'Oakwood Real Estate Partners, LLC',
    short_name: 'Oakwood (OREP)',
    kind: 'JV Equity — Deal-by-Deal',
    status: 'Term Sheet Received — First Deal TBD',
    primary_contact: 'R. Barton Spaulding, Managing Partner',
    headquarters: '55 Madison St, Suite 600, Denver, CO 80206',
    target_size: 'Deal-by-deal JV, ~10% sponsor skin. Sized to each transaction — no committed facility amount.',
    pref_pct: 8,
    promote_summary:
      '8% pref pari passu → 75/25 to 20% IRR → 50/50 thereafter. Additional Capital Contributions earn priority 15% IRR ahead of the stack.',
    geo_focus: 'All states not covered by the CentrePoint agreement. Colorado added post-CentrePoint tail. 5-mile non-compete radius around each JV property.',
    strategy_fit: 'Single-asset IOS JV. Non-recourse to OREP; Ben Backer + Aasif Bade guarantor entity carries all repayment/recourse/bad-boy obligations.',
    sponsor_skin_pct: 10,
    asset_mgmt_fee_pct: 1,
    acq_fee_pct: 2,
    loan_rate_pct: null,
    leverage_target_pct: 65,
    hold_period: 'Undefined (OREP has unilateral forced-sale right)',
    exclusivity_notes:
      'No ROFR (deferred to CentrePoint), but SPC must present all IOS acquisitions in non-CentrePoint states to OREP before offering to other capital. 5-mile non-compete around each Property.',
    signed_date: null,
    notes:
      'Construction mgmt fee 5% of hard costs; leasing fee 1% of gross lease revenue. Standard debt profile: 65% LTC, ~6.75%, 36mo IO, 360mo am, 48mo term, 1.5% loan fee. First tranche of cost overruns funded by GP (no capital-account credit).',
  },
  {
    name: 'Aasif Bade — BFO Investments LLC',
    short_name: 'Aasif / BFO',
    kind: 'HNW Equity + Revolving Cash LOC',
    status: 'Revolving Demand Note EXECUTED',
    primary_contact: 'Aasif Bade',
    headquarters: null,
    target_size: 'Core-deal equity co-invest + cash revolver on demand.',
    pref_pct: null,
    promote_summary: 'Aasif participates as passive LP equity in core deals; separate revolving demand note carries a fixed 10% coupon on drawn balances.',
    geo_focus: null,
    strategy_fit: 'Core IOS deals (higher-quality, stabilized or near-stabilized). LOC is bridge-only, meant to plug earnest-money / diligence-cost gaps.',
    sponsor_skin_pct: null,
    asset_mgmt_fee_pct: null,
    acq_fee_pct: null,
    loan_rate_pct: 10,
    leverage_target_pct: null,
    hold_period: 'Demand — payable at any time',
    exclusivity_notes: null,
    signed_date: null,
    notes:
      'Revolving demand note between BFO Investments LLC (lender) and Sandpiper Capital LLC (borrower). Draws at 10% annual. Use only when needed — this is standby capital, not a committed facility.',
  },
];

export async function POST() {
  await run('DELETE FROM capital_sources');

  for (const s of SOURCES) {
    await run(
      `INSERT INTO capital_sources (
         name, short_name, kind, status, primary_contact, headquarters, target_size,
         pref_pct, promote_summary, geo_focus, strategy_fit,
         sponsor_skin_pct, asset_mgmt_fee_pct, acq_fee_pct, loan_rate_pct,
         leverage_target_pct, hold_period, exclusivity_notes, signed_date, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.name, s.short_name, s.kind, s.status, s.primary_contact, s.headquarters, s.target_size,
        s.pref_pct, s.promote_summary, s.geo_focus, s.strategy_fit,
        s.sponsor_skin_pct, s.asset_mgmt_fee_pct, s.acq_fee_pct, s.loan_rate_pct,
        s.leverage_target_pct, s.hold_period, s.exclusivity_notes, s.signed_date, s.notes,
      ]
    );
  }

  return NextResponse.json({ ok: true, seeded: SOURCES.length });
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to reset the capital_sources table and load the three signed sources (CentrePoint, Oakwood, BFO/Aasif).',
    count: SOURCES.length,
    sources: SOURCES.map(s => s.short_name || s.name),
  });
}
