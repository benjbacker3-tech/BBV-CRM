'use client';

import { useState } from 'react';
import { Deal, STAGES, fmt, fmtNum } from '@/lib/utils';

interface Props {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
}

// When editing, YoC fields are stored as percentages (10.5 for 10.5%) rather than
// decimals (0.105). We convert on load/save so the UI is intuitive.
const toPct = (v: number | null | undefined) => ((v ?? 0) * 100);
const fromPct = (v: number | string) => (typeof v === 'string' ? parseFloat(v) || 0 : v) / 100;

export default function OverviewTab({ deal, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    ...deal,
    yoc_initial: toPct(deal.yoc_initial),
    yoc_target: toPct(deal.yoc_target),
    occupancy: toPct(deal.occupancy),
  }));

  const save = async () => {
    const payload = {
      ...form,
      yoc_initial: fromPct(form.yoc_initial),
      yoc_target: fromPct(form.yoc_target),
      occupancy: fromPct(form.occupancy),
    };
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const updated = await res.json();
    onUpdate(updated);
    setEditing(false);
  };

  if (editing) {
    const fieldGroups: { label: string; fields: { key: keyof Deal | string; label: string; type?: string; step?: string }[] }[] = [
      {
        label: 'Property',
        fields: [
          { key: 'name', label: 'Name' },
          { key: 'address', label: 'Address' },
          { key: 'city', label: 'City' },
          { key: 'market', label: 'Market' },
          { key: 'submarket', label: 'Submarket' },
          { key: 'zoning', label: 'Zoning' },
        ],
      },
      {
        label: 'Specs',
        fields: [
          { key: 'sf', label: 'SF (Building)', type: 'number', step: '1' },
          { key: 'acreage', label: 'Acres', type: 'number', step: '0.01' },
          { key: 'occupancy', label: 'Occupancy (%)', type: 'number', step: '1' },
        ],
      },
      {
        label: 'Basis & Returns',
        fields: [
          { key: 'asking_price', label: 'Asking Price ($)', type: 'number', step: '10000' },
          { key: 'yoc_initial', label: 'Initial YoC (%)', type: 'number', step: '0.1' },
          { key: 'yoc_target', label: 'Stab YoC (%)', type: 'number', step: '0.1' },
          { key: 'equity_required', label: 'Equity Required ($)', type: 'number', step: '10000' },
        ],
      },
      {
        label: 'Transaction',
        fields: [
          { key: 'dd_days', label: 'DD Period (days)', type: 'number', step: '1' },
          { key: 'close_days', label: 'Close (days)', type: 'number', step: '1' },
          { key: 'deposit', label: 'Deposit ($)', type: 'number', step: '1000' },
          { key: 'dd_expiry', label: 'DD Expiry', type: 'date' },
          { key: 'source', label: 'Source' },
        ],
      },
    ];

    return (
      <div className="space-y-5">
        {fieldGroups.map(group => (
          <div key={group.label}>
            <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-2">{group.label}</h5>
            <div className="grid grid-cols-2 gap-2">
              {group.fields.map(({ key, label, type, step }) => (
                <div key={key as string} className={type === 'date' || key === 'name' || key === 'address' ? 'col-span-2' : ''}>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-0.5">{label}</label>
                  <input
                    type={type || 'text'}
                    step={step}
                    value={(form as unknown as Record<string, unknown>)[key as string] as string | number ?? ''}
                    onChange={(e) => setForm({ ...form, [key as string]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div>
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-2">Stage</h5>
          <select
            value={form.stage}
            onChange={(e) => setForm({ ...form, stage: e.target.value as Deal['stage'] })}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
          >
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-2">Notes</h5>
          <textarea
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
          />
        </div>

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-surface pb-2">
          <button onClick={save} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Save</button>
          <button onClick={() => { setEditing(false); setForm({ ...deal, yoc_initial: toPct(deal.yoc_initial), yoc_target: toPct(deal.yoc_target), occupancy: toPct(deal.occupancy) }); }}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
        </div>
      </div>
    );
  }

  const landSF = (deal.acreage || 0) * 43560;
  const plf = landSF > 0 ? (deal.asking_price || 0) / landSF : 0;
  const far = landSF > 0 ? (deal.sf || 0) / landSF : 0;

  const fieldGroups: { label: string; items: { label: string; value: string; mono?: boolean }[] }[] = [
    {
      label: 'Property',
      items: [
        { label: 'City', value: deal.city || '—' },
        { label: 'Market', value: deal.market || '—' },
        { label: 'Submarket', value: deal.submarket || '—' },
        { label: 'Zoning', value: deal.zoning || '—' },
      ],
    },
    {
      label: 'Specs',
      items: [
        { label: 'Building SF', value: deal.sf ? fmtNum(deal.sf, 0) : '—', mono: true },
        { label: 'Acres', value: deal.acreage ? fmtNum(deal.acreage, 2) : '—', mono: true },
        { label: 'FAR', value: far ? far.toFixed(2) : '—', mono: true },
        { label: 'Occupancy', value: deal.occupancy ? `${Math.round((deal.occupancy) * 100)}%` : '—', mono: true },
      ],
    },
    {
      label: 'Basis & Returns',
      items: [
        { label: 'Asking Price', value: fmt(deal.asking_price), mono: true },
        { label: '$ / LSF', value: plf ? `$${plf.toFixed(2)}` : '—', mono: true },
        { label: 'Initial YoC', value: deal.yoc_initial ? `${(deal.yoc_initial * 100).toFixed(1)}%` : '—', mono: true },
        { label: 'Stab YoC', value: deal.yoc_target ? `${(deal.yoc_target * 100).toFixed(1)}%` : '—', mono: true },
        { label: 'Equity Required', value: deal.equity_required ? fmt(deal.equity_required) : '—', mono: true },
      ],
    },
    {
      label: 'Transaction',
      items: [
        { label: 'DD Period', value: deal.dd_days ? `${deal.dd_days} days` : '—', mono: true },
        { label: 'Close', value: deal.close_days ? `${deal.close_days} days` : '—', mono: true },
        { label: 'Deposit', value: deal.deposit ? fmt(deal.deposit) : '—', mono: true },
        { label: 'DD Expiry', value: deal.dd_expiry || '—', mono: true },
        { label: 'Source', value: deal.source || '—' },
      ],
    },
  ];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing(true)} className="text-xs text-amber hover:text-amber-dark font-medium">
          Edit
        </button>
      </div>
      <div className="space-y-4">
        {fieldGroups.map(group => (
          <div key={group.label}>
            <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-1.5">{group.label}</h5>
            <div className="space-y-1.5">
              {group.items.map(f => (
                <div key={f.label} className="flex justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{f.label}</span>
                  <span className={`text-xs text-gray-900 dark:text-gray-100 ${f.mono ? 'font-mono tabular-nums' : ''}`}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {deal.notes && (
        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-1.5">Notes</h5>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{deal.notes}</p>
        </div>
      )}
    </div>
  );
}
