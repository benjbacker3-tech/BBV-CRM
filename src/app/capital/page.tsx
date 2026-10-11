'use client';

import { useEffect, useState } from 'react';
import { CapitalSource } from '@/lib/utils';

export default function CapitalPage() {
  const [sources, setSources] = useState<CapitalSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/capital-sources')
      .then(r => r.json())
      .then((rows: CapitalSource[]) => setSources(rows))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const seed = async () => {
    if (!confirm('Reload capital sources from term sheets? This wipes the current list first.')) return;
    setSeeding(true);
    await fetch('/api/seed-capital', { method: 'POST' });
    setSeeding(false);
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sandpiper Capital LLC · Capital Stack</p>
          <h1 className="page-title">Capital Sources</h1>
        </div>
        <button
          onClick={seed}
          disabled={seeding}
          className="btn-secondary"
          title="Reset capital_sources from the seed data (CentrePoint, Oakwood, BFO)"
        >
          {seeding ? 'Loading…' : 'Reload from term sheets'}
        </button>
      </div>

      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      {!loading && sources.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-3">No capital sources loaded yet.</p>
          <button onClick={seed} className="btn-primary">
            Load CentrePoint, Oakwood & BFO from term sheets
          </button>
        </div>
      )}

      {!loading && sources.length > 0 && (
        <h2 className="section-label mb-2">Sources <span className="count">{sources.length}</span></h2>
      )}
      <div className="space-y-3">
        {sources.map(s => <SourceCard key={s.id} source={s} />)}
      </div>
    </div>
  );
}

// Status chip color: Signed green, Draft LOI amber, Verbal blue.
function statusPill(status: string): string {
  const v = status.toLowerCase();
  if (v.includes('signed') || v.includes('active') || v.includes('closed')) return 'pill pill-green';
  if (v.includes('loi') || v.includes('draft') || v.includes('pending')) return 'pill pill-amber';
  if (v.includes('verbal')) return 'pill pill-blue';
  if (v.includes('dead') || v.includes('pass') || v.includes('declin')) return 'pill pill-muted';
  return 'pill pill-slate';
}

function SourceCard({ source: s }: { source: CapitalSource }) {
  const [expanded, setExpanded] = useState(false);

  const stat = (label: string, value: string | number | null) => {
    if (value == null || value === '') return null;
    return (
      <div>
        <p className="field-label">{label}</p>
        <p className="text-[13px] font-mono tabular-nums text-slate-800 dark:text-slate-200">{value}</p>
      </div>
    );
  };

  const section = (label: string, value: string | null, last = false) => {
    if (!value) return null;
    return (
      <section className={last ? '' : 'mb-4'}>
        <p className="field-label">{label}</p>
        <p className="text-[13px] text-slate-800 dark:text-slate-200 leading-relaxed">{value}</p>
      </section>
    );
  };

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <div
        className="px-4 py-3.5 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-navy dark:text-blue-300">{s.short_name || s.name}</h3>
            {s.kind && <span className="pill pill-slate">{s.kind}</span>}
          </div>
          {s.short_name && s.name !== s.short_name && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.name}</p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-600 dark:text-slate-400">
            {s.status && <span className={statusPill(s.status)}>{s.status}</span>}
            {s.primary_contact && <span>· {s.primary_contact}</span>}
            {s.geo_focus && <span>· {s.geo_focus.split('.')[0]}</span>}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="card-body border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          {section('Size / Scope', s.target_size)}

          <div className="grid grid-cols-3 gap-4 mb-4 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
            {stat('Preferred Return', s.pref_pct != null ? `${s.pref_pct}%` : null)}
            {stat('Leverage Target', s.leverage_target_pct != null ? `${s.leverage_target_pct}% LTC` : null)}
            {stat('Hold Period', s.hold_period)}
            {stat('Sponsor Skin', s.sponsor_skin_pct != null ? `${s.sponsor_skin_pct}%` : null)}
            {stat('Acq Fee (to SPC)', s.acq_fee_pct != null ? `${s.acq_fee_pct}%` : null)}
            {stat('Asset Mgmt Fee', s.asset_mgmt_fee_pct != null ? `${s.asset_mgmt_fee_pct}%` : null)}
            {stat('Loan Rate', s.loan_rate_pct != null ? `${s.loan_rate_pct}%` : null)}
            {stat('Signed', s.signed_date)}
            {stat('HQ', s.headquarters)}
          </div>

          {section('Waterfall / Promote', s.promote_summary)}
          {section('Strategy Fit', s.strategy_fit)}
          {section('Geography', s.geo_focus)}
          {section('Exclusivity / Non-compete', s.exclusivity_notes)}
          {section('Notes', s.notes, true)}
        </div>
      )}
    </div>
  );
}
