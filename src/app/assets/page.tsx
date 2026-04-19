'use client';

import { useEffect, useState } from 'react';
import { Deal, fmt, fmtNum, fmtPct } from '@/lib/utils';

export default function AssetsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    fetch('/api/deals').then(r => r.json()).then((all: Deal[]) => {
      setDeals(all.filter(d => d.stage === 'Closed' || d.stage === 'Under Contract'));
    });
  }, []);

  const closed = deals.filter(d => d.stage === 'Closed');
  const underContract = deals.filter(d => d.stage === 'Under Contract');
  const totalValue = closed.reduce((s, d) => s + d.asking_price, 0);
  const totalAcreage = closed.reduce((s, d) => s + d.acreage, 0);

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Assets</h1>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Owned Assets', value: `${closed.length}`, color: 'border-green-500' },
          { label: 'Portfolio Value', value: fmt(totalValue), color: 'border-blue-500' },
          { label: 'Total Acreage', value: `${fmtNum(totalAcreage)} ac`, color: 'border-amber' },
          { label: 'Under Contract', value: `${underContract.length}`, color: 'border-purple-500' },
        ].map(c => (
          <div key={c.label} className={`bg-white dark:bg-surface rounded-lg border-l-4 ${c.color} border border-gray-100 dark:border-gray-700 p-4`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.label}</p>
            <p className="text-xl font-mono font-semibold text-gray-900 dark:text-gray-100">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Owned Assets */}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Owned Assets</h2>
      <div className="space-y-3 mb-8">
        {closed.map(d => (
          <div key={d.id} className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{d.name}</h3>
              <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Closed</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{d.address}</p>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Market</p>
                <p className="text-sm">{d.market}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Acreage</p>
                <p className="text-sm font-mono">{fmtNum(d.acreage)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Acquisition Price</p>
                <p className="text-sm font-mono">{fmt(d.asking_price)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">YoC Target</p>
                <p className="text-sm font-mono">{fmtPct(d.yoc_target)}</p>
              </div>
            </div>
          </div>
        ))}
        {closed.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">No closed assets yet.</p>}
      </div>

      {/* Under Contract */}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Under Contract</h2>
      <div className="space-y-3">
        {underContract.map(d => (
          <div key={d.id} className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{d.name}</h3>
              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">Under Contract</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{d.address}</p>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Market</p>
                <p className="text-sm">{d.market}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Acreage</p>
                <p className="text-sm font-mono">{fmtNum(d.acreage)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Price</p>
                <p className="text-sm font-mono">{fmt(d.asking_price)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">DD Expiry</p>
                <p className="text-sm font-mono">{d.dd_expiry || '—'}</p>
              </div>
            </div>
          </div>
        ))}
        {underContract.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">No deals under contract.</p>}
      </div>
    </div>
  );
}
