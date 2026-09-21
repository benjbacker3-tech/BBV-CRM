'use client';

import { useEffect, useState } from 'react';
import { Deal, fmt, fmtNum } from '@/lib/utils';

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
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · Owned Portfolio</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">Assets</h1>
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
          <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-lg font-mono font-semibold text-gray-900">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Owned Assets */}
      <h2 className="text-[10px] uppercase tracking-[0.15em] font-semibold text-gray-500 mb-2">Owned Assets ({closed.length})</h2>
      <div className="space-y-3 mb-8">
        {closed.map(d => (
          <AssetCard key={d.id} deal={d} />
        ))}
        {closed.length === 0 && <p className="text-sm text-gray-400">No closed assets yet.</p>}
      </div>

      {/* Under Contract */}
      <h2 className="text-[10px] uppercase tracking-[0.15em] font-semibold text-gray-500 mb-2">Under Contract ({underContract.length})</h2>
      <div className="space-y-3">
        {underContract.map(d => (
          <AssetCard key={d.id} deal={d} underContract />
        ))}
        {underContract.length === 0 && <p className="text-sm text-gray-400">No deals under contract.</p>}
      </div>
    </div>
  );
}

function AssetCard({ deal: d, underContract }: { deal: Deal; underContract?: boolean }) {
  const ownership = d.ownership_pct ?? 100;
  const proRataPrice = d.asking_price * (ownership / 100);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{d.address}</h3>
          <span className="text-xs text-gray-500">{d.city}{d.city && d.market ? ', ' : ''}{d.market}</span>
        </div>
        <div className="flex items-center gap-2">
          {ownership < 100 && (
            <span className="text-[11px] bg-navy/10 text-navy px-2 py-0.5 rounded-full font-medium tabular-nums">
              {ownership}% owned
            </span>
          )}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            underContract ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {underContract ? 'Under Contract' : 'Closed'}
          </span>
        </div>
      </div>
      {d.notes && <p className="text-xs text-gray-500 mb-3">{d.notes}</p>}
      <div className="grid grid-cols-5 gap-4">
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
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-mono text-gray-900">{value}</p>
    </div>
  );
}
