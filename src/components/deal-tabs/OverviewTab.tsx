'use client';

import { useState } from 'react';
import { Deal, STAGES, fmt, fmtNum } from '@/lib/utils';

interface Props {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
}

export default function OverviewTab({ deal, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(deal);

  const save = async () => {
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const updated = await res.json();
    onUpdate(updated);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-3">
        {[
          { key: 'name', label: 'Name' },
          { key: 'address', label: 'Address' },
          { key: 'market', label: 'Market' },
          { key: 'submarket', label: 'Submarket' },
          { key: 'acreage', label: 'Acreage', type: 'number' },
          { key: 'asking_price', label: 'Asking Price', type: 'number' },
          { key: 'yoc_target', label: 'YoC Target (%)', type: 'number' },
          { key: 'zoning', label: 'Zoning' },
          { key: 'source', label: 'Source' },
          { key: 'dd_expiry', label: 'DD Expiry', type: 'date' },
        ].map(({ key, label, type }) => (
          <div key={key}>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
            <input
              type={type || 'text'}
              value={(form as unknown as Record<string, unknown>)[key] as string || ''}
              onChange={(e) => setForm({ ...form, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
            />
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Stage</label>
          <select
            value={form.stage}
            onChange={(e) => setForm({ ...form, stage: e.target.value as Deal['stage'] })}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
          >
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
          <textarea
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={save} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Save</button>
          <button onClick={() => { setEditing(false); setForm(deal); }} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
        </div>
      </div>
    );
  }

  const fields = [
    { label: 'Market', value: `${deal.market} — ${deal.submarket}` },
    { label: 'Acreage', value: `${fmtNum(deal.acreage)} acres` },
    { label: 'Asking Price', value: fmt(deal.asking_price), mono: true },
    { label: 'YoC Target', value: `${fmtNum(deal.yoc_target)}%`, mono: true },
    { label: 'Zoning', value: deal.zoning },
    { label: 'IOS Eligible', value: deal.ios_eligible ? 'Yes' : 'No' },
    { label: 'Source', value: deal.source },
    { label: 'DD Expiry', value: deal.dd_expiry || '—' },
  ];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing(true)} className="text-xs text-amber hover:text-amber-dark font-medium">
          Edit
        </button>
      </div>
      <div className="space-y-2.5">
        {fields.map(f => (
          <div key={f.label} className="flex justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">{f.label}</span>
            <span className={`text-sm text-gray-900 dark:text-gray-100 ${f.mono ? 'font-mono' : ''}`}>{f.value}</span>
          </div>
        ))}
      </div>
      {deal.notes && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <h4 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Notes</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300">{deal.notes}</p>
        </div>
      )}
    </div>
  );
}
