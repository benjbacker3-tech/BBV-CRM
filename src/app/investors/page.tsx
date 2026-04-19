'use client';

import { useEffect, useState } from 'react';
import { Investor, fmt } from '@/lib/utils';

export default function InvestorsPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'Family Office', commitment: 0, called: 0, status: 'Prospecting', notes: '' });

  const load = () => fetch('/api/investors').then(r => r.json()).then(setInvestors);
  useEffect(() => { load(); }, []);

  const add = async () => {
    await fetch('/api/investors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setAdding(false);
    setForm({ name: '', type: 'Family Office', commitment: 0, called: 0, status: 'Prospecting', notes: '' });
    load();
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Investors</h1>
        <button onClick={() => setAdding(!adding)} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">
          {adding ? 'Cancel' : '+ Add Investor'}
        </button>
      </div>

      {adding && (
        <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-5 grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-100" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-100">
              <option>Family Office</option>
              <option>HNW Individual</option>
              <option>Institutional</option>
              <option>REIT</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-100">
              <option>Prospecting</option>
              <option>Active</option>
              <option>Committed</option>
              <option>Inactive</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Commitment</label>
            <input type="number" value={form.commitment} onChange={e => setForm({ ...form, commitment: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm font-mono dark:bg-surface-dark dark:text-gray-100" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Called</label>
            <input type="number" value={form.called} onChange={e => setForm({ ...form, called: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm font-mono dark:bg-surface-dark dark:text-gray-100" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-100" />
          </div>
          <div className="col-span-3">
            <button onClick={add} className="px-4 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Save Investor</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {investors.map(inv => {
          const pct = inv.commitment > 0 ? (inv.called / inv.commitment) * 100 : 0;
          return (
            <div key={inv.id} className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{inv.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{inv.type}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  inv.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  inv.status === 'Committed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}>{inv.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-2">
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Commitment</p>
                  <p className="font-mono text-sm font-medium">{fmt(inv.commitment)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Called</p>
                  <p className="font-mono text-sm font-medium">{fmt(inv.called)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Remaining</p>
                  <p className="font-mono text-sm font-medium">{fmt(inv.commitment - inv.called)}</p>
                </div>
              </div>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-amber rounded-full" style={{ width: `${pct}%` }} />
              </div>
              {inv.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{inv.notes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
