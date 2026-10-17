'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Deal, fmt, fmtNum, shortDate } from '@/lib/utils';
import { PersonalProperty } from '@/lib/personal';

export default function AssetsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    fetch('/api/deals').then(r => r.json()).then((all: Deal[]) => {
      setDeals(all.filter(d => d.stage === 'Closed' || d.stage === 'Under Contract'));
    });
  }, []);

  const closed = deals.filter(d => d.stage === 'Closed');
  const underContract = deals.filter(d => d.stage === 'Under Contract');

  // Pro-rata figures — a 100% asset counts fully, an 18% co-invest counts as 0.18x.
  const proRataOf = (d: Deal, val: number) => val * ((d.ownership_pct ?? 100) / 100);
  const proRataValue = closed.reduce((s, d) => s + proRataOf(d, d.asking_price), 0);
  const proRataAcres = closed.reduce((s, d) => s + proRataOf(d, d.acreage), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sandpiper Capital LLC · Owned Portfolio</p>
          <h1 className="page-title">Assets</h1>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Owned Assets', value: `${closed.length}` },
          { label: 'Portfolio Value (pro rata)', value: fmt(proRataValue) },
          { label: 'Total Acres (pro rata)', value: `${fmtNum(proRataAcres, 1)} ac` },
          { label: 'Under Contract', value: `${underContract.length}` },
        ].map(c => (
          <div key={c.label} className="stat">
            <p className="stat-label">{c.label}</p>
            <p className="stat-value">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Owned Assets */}
      <h2 className="section-label mb-2">Owned Assets <span className="count">{closed.length}</span></h2>
      <div className="space-y-3 mb-6">
        {closed.map(d => (
          <AssetCard key={d.id} deal={d} />
        ))}
        {closed.length === 0 && <p className="text-xs italic text-slate-400">No closed assets yet.</p>}
      </div>

      {/* Under Contract */}
      <h2 className="section-label mb-2">Under Contract <span className="count">{underContract.length}</span></h2>
      <div className="space-y-3">
        {underContract.map(d => (
          <AssetCard key={d.id} deal={d} underContract />
        ))}
        {underContract.length === 0 && <p className="text-xs italic text-slate-400">No deals under contract.</p>}
      </div>

      <PersonalSection />
    </div>
  );
}

type PersonalSummary = PersonalProperty & {
  month: string;
  checkin: { rent_received: number; mortgage_paid: number; completed_at: string | null } | null;
  utilitiesOwed: number;
  nextReminder: { name: string; due_date: string } | null;
};

// Ben's own properties (Clayton, Emerson): listed here for one login, but kept apart from the
// Sandpiper figures above and everywhere else.
function PersonalSection() {
  const [props, setProps] = useState<PersonalSummary[] | null>(null);
  useEffect(() => { fetch('/api/personal').then(r => r.json()).then(setProps).catch(() => setProps([])); }, []);
  if (!props || props.length === 0) return null;
  return (
    <div className="mt-10 border-t border-dashed border-slate-300 pt-6">
      <h2 className="section-label mb-1">Personal <span className="count">{props.length}</span></h2>
      <p className="mb-3 text-[11px] text-slate-400">Private. Not part of Sandpiper Capital: excluded from the totals above, the Dashboard, exports, search and share links.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {props.map(p => {
          const c = p.checkin;
          const step = (done: boolean | undefined, label: string) => (
            <span className={`pill ${done ? 'pill-green' : 'pill-slate'}`}>{done ? '✓ ' : ''}{label}</span>
          );
          return (
            <Link key={p.slug} href={`/assets/personal/${p.slug}`} className="card block px-4 py-3.5 transition-colors hover:border-slate-300">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="text-[11px] text-slate-400">{p.entity}</p>
              </div>
              <p className="text-xs text-slate-500">{p.address}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                <div><p className="stat-label">Value</p>{fmt(p.est_value)}</div>
                <div><p className="stat-label">Loan</p>{fmt(p.loan_balance)}</div>
                <div><p className="stat-label">Rent</p>{fmt(p.tenant_rent)}/mo</div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {step(!!c?.rent_received, 'Rent')}
                {step(!!c?.mortgage_paid, 'Mortgage')}
                {step(!!c?.completed_at, 'Month done')}
                {p.utilitiesOwed > 0 && <span className="pill pill-amber">Utilities owed {fmt(p.utilitiesOwed)}</span>}
              </div>
              {p.nextReminder && <p className="mt-2 text-[11px] text-slate-500">Next: {p.nextReminder.name} · {shortDate(p.nextReminder.due_date)}</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AssetCard({ deal: d, underContract }: { deal: Deal; underContract?: boolean }) {
  const ownership = d.ownership_pct ?? 100;
  const proRataPrice = d.asking_price * (ownership / 100);

  return (
    <div className="card card-body">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{d.address}</h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{d.city}{d.city && d.market ? ', ' : ''}{d.market}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {ownership < 100 && (
            <span className="pill pill-navy font-mono tabular-nums">{ownership}% owned</span>
          )}
          <span className={underContract ? 'pill pill-navy' : 'pill pill-green'}>
            {underContract ? 'Under Contract' : 'Closed'}
          </span>
        </div>
      </div>
      {d.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{d.notes}</p>}
      <div className="grid grid-cols-5 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <Stat label="Building SF" value={d.sf ? fmtNum(d.sf, 0) : '—'} />
        <Stat label="Acres" value={d.acreage ? fmtNum(d.acreage, 2) : '—'} />
        <Stat label="Price (100%)" value={d.asking_price ? fmt(d.asking_price) : '—'} />
        {ownership < 100 && (
          <Stat label="Price (pro rata)" value={fmt(proRataPrice)} />
        )}
        <Stat label={underContract ? 'DD Expiry' : 'Close Date'} value={(underContract ? d.dd_expiry : d.close_date) || '—'} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="text-[13px] font-mono tabular-nums text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}
