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
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · Capital Stack</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">Capital Sources</h1>
        </div>
        <button
          onClick={seed}
          disabled={seeding}
          className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          title="Reset capital_sources from the seed data (CentrePoint, Oakwood, BFO)"
        >
          {seeding ? 'Loading…' : 'Reload from term sheets'}
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading && sources.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-600 mb-3">No capital sources loaded yet.</p>
          <button onClick={seed} className="px-4 py-2 bg-navy text-white text-sm rounded hover:bg-navy-light">
            Load CentrePoint, Oakwood & BFO from term sheets
          </button>
        </div>
      )}

      <div className="space-y-4">
        {sources.map(s => <SourceCard key={s.id} source={s} />)}
      </div>
    </div>
  );
}

function SourceCard({ source: s }: { source: CapitalSource }) {
  const [expanded, setExpanded] = useState(false);

  const stat = (label: string, value: string | number | null) => {
    if (value == null || value === '') return null;
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm text-gray-900">{value}</p>
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="px-5 py-4 flex items-start justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div className="flex items-baseline gap-3">
            <h3 className="text-base font-semibold text-navy">{s.short_name || s.name}</h3>
            {s.kind && <span className="text-[11px] uppercase tracking-wide text-gray-400">{s.kind}</span>}
          </div>
          {s.short_name && s.name !== s.short_name && (
            <p className="text-xs text-gray-500 mt-0.5">{s.name}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
            {s.status && (
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-navy" />
                {s.status}
              </span>
            )}
            {s.primary_contact && <span>· {s.primary_contact}</span>}
            {s.geo_focus && <span>· {s.geo_focus.split('.')[0]}</span>}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 bg-gray-50/40">
          {s.target_size && (
            <section className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Size / Scope</p>
              <p className="text-sm text-gray-800 leading-relaxed">{s.target_size}</p>
            </section>
          )}

          <div className="grid grid-cols-3 gap-4 mb-4">
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

          {s.promote_summary && (
            <section className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Waterfall / Promote</p>
              <p className="text-sm text-gray-800 leading-relaxed">{s.promote_summary}</p>
            </section>
          )}

          {s.strategy_fit && (
            <section className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Strategy Fit</p>
              <p className="text-sm text-gray-800 leading-relaxed">{s.strategy_fit}</p>
            </section>
          )}

          {s.geo_focus && (
            <section className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Geography</p>
              <p className="text-sm text-gray-800 leading-relaxed">{s.geo_focus}</p>
            </section>
          )}

          {s.exclusivity_notes && (
            <section className="mb-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Exclusivity / Non-compete</p>
              <p className="text-sm text-gray-800 leading-relaxed">{s.exclusivity_notes}</p>
            </section>
          )}

          {s.notes && (
            <section>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-800 leading-relaxed">{s.notes}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
