'use client';

import { useEffect, useMemo, useState } from 'react';
import { Deal, fmt } from '@/lib/utils';

// SPC's default fee stack when SPC is the sponsor (source: CentrePoint term sheet).
// A deal where SPC isn't a sponsor (co-invest, passive LP) doesn't earn these.
const ACQ_FEE_PCT = 0.0135;   // 1.35% of purchase price at closing
const AM_FEE_PCT = 0.01;      // 1% of invested equity per year

// Stages the dashboard tracks in detail — everything past the LOI stage.
const TRACKED_STAGES = ['Closed', 'Under Contract', 'Negotiating PSA'] as const;
type TrackedStage = (typeof TRACKED_STAGES)[number];

export default function Dashboard() {
  const [deals, setDeals] = useState<Deal[] | null>(null);

  useEffect(() => {
    fetch('/api/deals').then(r => r.json()).then(setDeals);
  }, []);

  const tracked = useMemo(() => (deals || []).filter(d => (TRACKED_STAGES as readonly string[]).includes(d.stage)), [deals]);
  const byStage = useMemo(() => {
    const out: Record<TrackedStage, Deal[]> = { 'Closed': [], 'Under Contract': [], 'Negotiating PSA': [] };
    for (const d of tracked) out[d.stage as TrackedStage].push(d);
    return out;
  }, [tracked]);

  const totals = useMemo(() => {
    const t = { price: 0, equity: 0, acqFee: 0, amFee: 0, sponsorDeals: 0 };
    for (const d of tracked) {
      t.price += d.asking_price || 0;
      t.equity += d.equity_required || 0;
      if (isSponsor(d)) {
        t.sponsorDeals++;
        t.acqFee += (d.asking_price || 0) * ACQ_FEE_PCT;
        t.amFee += (d.equity_required || 0) * AM_FEE_PCT;
      }
    }
    return t;
  }, [tracked]);

  if (!deals) return <LoadingSkeleton />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6 pb-4 border-b border-gray-200">
        <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · Committed Portfolio</p>
        <h1 className="text-xl font-medium text-gray-900 tracking-tight">{greeting}, Ben</h1>
        <p className="text-xs text-gray-500 mt-1">
          Tracking {tracked.length} deals across Closed, Under Contract, and Negotiating PSA.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <SummaryTile label="Committed Deals" value={String(tracked.length)} />
        <SummaryTile label="Purchase Price" value={fmt(totals.price)} />
        <SummaryTile label="Equity Required" value={fmt(totals.equity)} />
        <SummaryTile label="Projected Fees to SPC" value={fmt(totals.acqFee + totals.amFee)} sub={`${fmt(totals.acqFee)} acq + ${fmt(totals.amFee)}/yr AM`} />
      </div>

      {/* Sections */}
      {TRACKED_STAGES.map(stage => (
        <StageSection key={stage} stage={stage} deals={byStage[stage]} />
      ))}
    </div>
  );
}

function isSponsor(d: Deal): boolean {
  // SPC earns fees when SPC (via a JV entity) is the sponsor. A Closed deal we
  // co-invested in as a passive LP shows an ownership_pct < 100 and no fees.
  return (d.ownership_pct ?? 100) === 100;
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-mono font-semibold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-1 font-mono">{sub}</p>}
    </div>
  );
}

function StageSection({ stage, deals }: { stage: TrackedStage; deals: Deal[] }) {
  if (deals.length === 0) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-[10px] uppercase tracking-[0.15em] font-semibold text-gray-700">{stage}</h2>
          <span className="text-[10px] text-gray-400 font-mono">(0)</span>
        </div>
        <p className="text-xs text-gray-400 italic">None yet.</p>
      </div>
    );
  }

  const subtotals = deals.reduce(
    (acc, d) => {
      acc.price += d.asking_price || 0;
      acc.equity += d.equity_required || 0;
      if (isSponsor(d)) {
        acc.acqFee += (d.asking_price || 0) * ACQ_FEE_PCT;
        acc.amFee += (d.equity_required || 0) * AM_FEE_PCT;
      }
      return acc;
    },
    { price: 0, equity: 0, acqFee: 0, amFee: 0 }
  );

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[10px] uppercase tracking-[0.15em] font-semibold text-gray-700">{stage}</h2>
        <span className="text-[10px] text-gray-400 font-mono">({deals.length})</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200 bg-gray-50/50">
              <th className="text-left py-2 px-3 font-semibold uppercase tracking-wide text-[9px]">Deal</th>
              <th className="text-left py-2 px-3 font-semibold uppercase tracking-wide text-[9px]">Location</th>
              <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[9px]">Ownership</th>
              <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[9px]">Price</th>
              <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[9px]">Equity</th>
              <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[9px]">Acq Fee</th>
              <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[9px]">AM Fee / Yr</th>
            </tr>
          </thead>
          <tbody>
            {deals.map(d => {
              const ownership = d.ownership_pct ?? 100;
              const sponsor = isSponsor(d);
              const acqFee = sponsor ? (d.asking_price || 0) * ACQ_FEE_PCT : 0;
              const amFee = sponsor ? (d.equity_required || 0) * AM_FEE_PCT : 0;
              return (
                <tr key={d.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-2 px-3 font-medium text-gray-900">{d.address}</td>
                  <td className="py-2 px-3 text-gray-600">{[d.city, d.market].filter(Boolean).join(' · ')}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-gray-700">{ownership}%</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-gray-900">{fmt(d.asking_price || 0)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-gray-900">{fmt(d.equity_required || 0)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-gray-900">{sponsor ? fmt(acqFee) : '—'}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-gray-900">{sponsor ? fmt(amFee) : '—'}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-gray-300 bg-gray-50/60">
              <td className="py-2 px-3 font-semibold text-gray-700 uppercase tracking-wide text-[9px]" colSpan={3}>Subtotal</td>
              <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-gray-900">{fmt(subtotals.price)}</td>
              <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-gray-900">{fmt(subtotals.equity)}</td>
              <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-gray-900">{fmt(subtotals.acqFee)}</td>
              <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-gray-900">{fmt(subtotals.amFee)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[10px] text-gray-400">
        Fee stack: 1.35% acquisition fee at close + 1% asset mgmt fee/yr on equity. Passive co-invests (ownership &lt; 100%) don&apos;t earn sponsor fees.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
      <div className="h-4 w-96 bg-gray-100 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-100 p-4 h-20 animate-pulse" />
        ))}
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 bg-gray-100 rounded animate-pulse mb-6" />
      ))}
    </div>
  );
}
