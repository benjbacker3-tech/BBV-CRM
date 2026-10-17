'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Checkin, PersonalProperty, UTILITIES, UTILITY_LABEL, UtilityBill, currentMonth, fmtDay, monthLabel, shiftMonth, usd } from '@/lib/personal';
import MonthPicker from '@/components/MonthPicker';

type Resp = { property: PersonalProperty; month: string; checkin: Checkin | null; utilities: UtilityBill[] };

// This Month: rent in, mortgage out, utilities status, notes, mark complete.
export default function ThisMonth() {
  const { slug } = useParams<{ slug: string }>();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Resp | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (m: string) => {
    const d: Resp = await fetch(`/api/personal/${slug}/checkin?month=${m}`).then(r => r.json());
    setData(d);
    setNotes(d.checkin?.notes ?? '');
  }, [slug]);
  useEffect(() => { load(month); }, [load, month]);

  const post = async (body: Record<string, unknown>) => {
    setSaving(true);
    await fetch(`/api/personal/${slug}/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, ...body }) });
    await load(month);
    setSaving(false);
  };

  if (!data) return <p className="text-xs text-slate-400">Loading…</p>;
  const p = data.property;
  const c = data.checkin;
  const status = (u: string) => {
    const b = data.utilities.find(x => x.utility_type === u);
    if (!b || b.amount_paid == null) return { pill: 'pill-red', label: 'Not paid', b };
    if (b.amount_recharged != null && b.amount_recharged >= b.amount_paid) return { pill: 'pill-green', label: 'Settled', b };
    return { pill: 'pill-amber', label: b.amount_recharged ? 'Partial' : 'Owed', b };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{p.name}</h1>
          <p className="page-sub">{p.address}{p.entity ? ` · ${p.entity}` : ''}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} label={monthLabel(month)} prev={shiftMonth(month, -1)} next={shiftMonth(month, 1)} />
      </div>

      <div className="grid gap-3">
        <CheckRow done={!!c?.rent_received} disabled={saving} onClick={() => post({ action: 'rent' })}
          title={`Rent received: ${usd(p.tenant_rent)} from ${p.tenant_name}`} sub={c?.rent_received && c.rent_received_date ? `Logged ${fmtDay(c.rent_received_date)}` : null} />
        <CheckRow done={!!c?.mortgage_paid} disabled={saving} onClick={() => post({ action: 'mortgage' })}
          title={`Mortgage paid: ${usd(p.loan_payment)} to ${p.loan_servicer}`} sub={c?.mortgage_paid && c.mortgage_paid_date ? `Logged ${fmtDay(c.mortgage_paid_date)}` : null} />
      </div>

      <div className="card">
        <div className="card-header">
          <p className="card-title">Utilities</p>
          <Link href={`/assets/personal/${slug}/utilities`} className="text-xs font-medium text-navy hover:underline">Update →</Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {UTILITIES.map(u => {
            const s = status(u);
            return (
              <li key={u} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-24 font-medium text-slate-800">{UTILITY_LABEL[u]}</span>
                <span className="flex-1 text-slate-600">
                  {s.b?.amount_paid != null ? <>paid {usd(s.b.amount_paid)}</> : <span className="text-slate-400">not paid</span>}
                  {s.b?.amount_recharged != null && <> · recharged {usd(s.b.amount_recharged)}</>}
                </span>
                <span className={`pill ${s.pill}`}>{s.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card card-body">
        <label className="field-label">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => post({ action: 'notes', notes })} rows={3} className="field !text-sm" placeholder="Anything to remember about this month…" />
      </div>

      <button onClick={() => post({ action: 'complete' })} disabled={saving} className={`w-full rounded-xl py-3 text-sm font-semibold ${c?.completed_at ? 'border border-emerald-300 bg-emerald-50 text-emerald-700' : 'bg-navy text-white hover:bg-navy-light'}`}>
        {c?.completed_at ? `✓ Month complete · ${fmtDay(c.completed_at)}` : 'Mark month complete'}
      </button>
    </div>
  );
}

function CheckRow({ done, disabled, onClick, title, sub }: { done: boolean; disabled: boolean; onClick: () => void; title: string; sub: string | null }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition ${done ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
        {done && <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        {sub && <span className="block text-xs text-emerald-700">{sub}</span>}
      </span>
    </button>
  );
}
