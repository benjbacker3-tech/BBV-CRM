'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { UTILITIES, UTILITY_LABEL, UtilityBill, UtilityType, currentMonth, monthLabel, shiftMonth, todayIso, usd } from '@/lib/personal';
import MonthPicker from '@/components/MonthPicker';

type Resp = { property: { tenant_name: string }; month: string; bills: UtilityBill[]; balanceOwed: number };

// Utility bills paid and recharged to the tenant, with the last six months and what's owed.
export default function Utilities() {
  const { slug } = useParams<{ slug: string }>();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Resp | null>(null);
  const [form, setForm] = useState<Record<string, UtilityBill>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    const d: Resp = await fetch(`/api/personal/${slug}/utilities?month=${m}`).then(r => r.json());
    setData(d);
    const f: Record<string, UtilityBill> = {};
    for (const u of UTILITIES) {
      f[u] = d.bills.find(x => x.utility_type === u && x.month === m)
        ?? { utility_type: u, month: m, amount_paid: null, date_paid: null, amount_recharged: null, date_recharged: null, notes: null };
    }
    setForm(f);
  }, [slug]);
  useEffect(() => { load(month); }, [load, month]);

  const update = (u: UtilityType, patch: Partial<UtilityBill>) => setForm(prev => ({ ...prev, [u]: { ...prev[u], ...patch } }));
  const save = async (u: UtilityType) => {
    await fetch(`/api/personal/${slug}/utilities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form[u], month }) });
    setSaved(u);
    setTimeout(() => setSaved(null), 1500);
    await load(month);
  };

  if (!data) return <p className="text-xs text-slate-400">Loading…</p>;
  const history = Array.from({ length: 6 }, (_, i) => shiftMonth(month, -(i + 1)));
  const cell = (m: string, u: string, k: 'amount_paid' | 'amount_recharged') => {
    const v = data.bills.find(x => x.month === m && x.utility_type === u)?.[k];
    return v != null ? usd(v) : '—';
  };
  const num = (v: string) => (v === '' ? null : parseFloat(v));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Utilities</h1>
        <MonthPicker month={month} onChange={setMonth} label={monthLabel(month)} prev={shiftMonth(month, -1)} next={shiftMonth(month, 1)} />
      </div>

      {data.balanceOwed > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>{data.property.tenant_name} owes {usd(data.balanceOwed)}</b> across all utilities to date.
        </div>
      )}

      {UTILITIES.map(u => {
        const b = form[u];
        if (!b) return null;
        return (
          <div key={u} className="card card-body">
            <p className="card-title mb-3">{UTILITY_LABEL[u]}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Amount paid"><input type="number" step="0.01" value={b.amount_paid ?? ''} onChange={e => update(u, { amount_paid: num(e.target.value) })} className="field" /></Field>
              <Field label="Date paid"><input type="date" value={b.date_paid ?? ''} onChange={e => update(u, { date_paid: e.target.value || null })} className="field" /></Field>
              <Field label="Amount recharged"><input type="number" step="0.01" value={b.amount_recharged ?? ''} onChange={e => update(u, { amount_recharged: num(e.target.value) })} className="field" /></Field>
              <Field label="Date recharged"><input type="date" value={b.date_recharged ?? ''} onChange={e => update(u, { date_recharged: e.target.value || null })} className="field" /></Field>
              <div className="sm:col-span-2"><Field label="Notes"><input value={b.notes ?? ''} onChange={e => update(u, { notes: e.target.value || null })} className="field" /></Field></div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => save(u)} className="btn-primary">Save</button>
              {b.amount_paid != null && !b.date_paid && <button onClick={() => update(u, { date_paid: todayIso() })} className="btn-ghost">Use today for date paid</button>}
              {saved === u && <span className="text-xs text-emerald-700">Saved</span>}
            </div>
          </div>
        );
      })}

      <div className="card overflow-x-auto">
        <div className="card-header"><p className="card-title">Last 6 months</p><span className="text-[11px] text-slate-400">paid / recharged</span></div>
        <table className="table-clean">
          <thead><tr><th>Month</th>{UTILITIES.map(u => <th key={u} className="!text-right">{UTILITY_LABEL[u]}</th>)}</tr></thead>
          <tbody>
            {history.map(m => (
              <tr key={m} className="row">
                <td>{monthLabel(m)}</td>
                {UTILITIES.map(u => <td key={u} className="num">{cell(m, u, 'amount_paid')} / {cell(m, u, 'amount_recharged')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field-label">{label}</label>{children}</div>;
}
