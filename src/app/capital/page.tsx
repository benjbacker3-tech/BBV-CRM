'use client';

import { useEffect, useState } from 'react';
import { Investor, fmt, fmtPct } from '@/lib/utils';

export default function CapitalPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);

  useEffect(() => {
    fetch('/api/investors').then(r => r.json()).then(setInvestors);
  }, []);

  const totalCommitment = investors.reduce((sum, i) => sum + i.commitment, 0);
  const totalCalled = investors.reduce((sum, i) => sum + i.called, 0);
  const uncalled = totalCommitment - totalCalled;
  const pctCalled = totalCommitment > 0 ? (totalCalled / totalCommitment) * 100 : 0;

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Capital</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Commitments', value: fmt(totalCommitment), color: 'border-blue-500' },
          { label: 'Capital Called', value: fmt(totalCalled), color: 'border-green-500' },
          { label: 'Uncalled Capital', value: fmt(uncalled), color: 'border-amber' },
          { label: '% Called', value: fmtPct(pctCalled), color: 'border-purple-500' },
        ].map(c => (
          <div key={c.label} className={`bg-white dark:bg-surface rounded-lg border-l-4 ${c.color} border border-gray-100 dark:border-gray-700 p-4`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.label}</p>
            <p className="text-xl font-mono font-semibold text-gray-900 dark:text-gray-100">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Capital call progress */}
      <div className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Capital Deployment</h3>
        <div className="w-full h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber rounded-full transition-all" style={{ width: `${pctCalled}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Called: {fmt(totalCalled)}</span>
          <span>Remaining: {fmt(uncalled)}</span>
        </div>
      </div>

      {/* Investor breakdown */}
      <div className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-surface-dark">
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Investor</th>
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
              <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Commitment</th>
              <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Called</th>
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {investors.map(inv => (
              <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-gray-100">{inv.name}</td>
                <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300">{inv.type}</td>
                <td className="py-2.5 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{fmt(inv.commitment)}</td>
                <td className="py-2.5 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{fmt(inv.called)}</td>
                <td className="py-2.5 px-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    inv.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}>{inv.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
