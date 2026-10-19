'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Expected, LEDGER_CATEGORIES, NOTE_CATEGORY, PersonalProperty, monthLabel, usd } from '@/lib/personal';
import { EditValues } from '@/components/PersonalBits';
import PersonalKeyDates from '@/components/PersonalKeyDates';

const BLANK = { id: '', label: '', type: 'Expense', category: 'Water', amount: '', every_months: '1', start_month: '', end_month: '', match: '' };
type Form = typeof BLANK;

// Property file: the facts that rarely change, what each month should look like (which drives
// the monthly audit and statement matching), and key dates.
export default function PropertyFile() {
  const { slug } = useParams<{ slug: string }>();
  const [p, setP] = useState<PersonalProperty | null>(null);
  const [expected, setExpected] = useState<Expected[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const load = useCallback(async () => {
    const [prop, ex] = await Promise.all([fetch(`/api/personal/${slug}`).then(r => r.json()), fetch(`/api/personal/${slug}/expected`).then(r => r.json())]);
    setP(prop);
    setExpected(ex.expected);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    const r = await fetch(`/api/personal/${slug}/expected`, { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).then(x => x.json());
    if (r.error) return alert(r.error);
    setExpected(r.expected);
    setForm(null);
  };
  const remove = async (id: string) => {
    if (!confirm('Stop expecting this every month? Past months keep their entries.')) return;
    const r = await fetch(`/api/personal/${slug}/expected?id=${id}`, { method: 'DELETE' }).then(x => x.json());
    setExpected(r.expected);
  };

  if (!p || !expected) return <p className="text-xs text-slate-400">Loading…</p>;
  const cats = [...LEDGER_CATEGORIES, ...(slug === 'emerson' ? [NOTE_CATEGORY] : [])];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">{p.name}</h1>
        <p className="page-sub">{p.address}{p.entity ? ` · ${p.entity}` : ''}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Fact title="Tenant" lines={[p.tenant_name, `${usd(p.tenant_rent)} / month`]} />
        <Fact title="Loan" lines={[p.loan_servicer, `${usd(p.loan_payment)} / month · ${p.loan_rate}%`, `Balance ${usd(p.loan_balance)} · matures ${p.loan_matures?.slice(0, 7) || '—'}`]} />
        <Fact title="Bank" lines={[`${p.bank_name}${p.bank_last_four ? ` ····${p.bank_last_four}` : ''}`, 'Statements import on the Monthly audit tab']} />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <p className="card-title">Every month</p>
            <p className="text-[11px] text-slate-500">What the audit checks each month, and the words that spot each one on a bank statement.</p>
          </div>
          <button onClick={() => setForm({ ...BLANK })} className="btn-secondary !py-1 !text-xs">+ Add</button>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {expected.map(e => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <span className={`w-10 text-[10px] font-bold uppercase ${e.type === 'Income' ? 'text-emerald-700' : 'text-slate-500'}`}>{e.type === 'Income' ? 'In' : 'Out'}</span>
              <span className="min-w-[180px] flex-1 font-medium text-slate-800 dark:text-slate-200">{e.label}<span className="ml-2 text-xs font-normal text-slate-400">{e.category}</span></span>
              <span className="w-24 text-right font-mono text-xs">{e.amount != null ? usd(e.amount) : 'varies'}</span>
              <span className="w-44 text-xs text-slate-500">
                {e.every_months > 1 ? `every ${e.every_months} months` : 'monthly'}
                {e.start_month ? ` · from ${monthLabel(e.start_month).replace(/ \d{4}$/, m => m.replace(' 20', " '"))}` : ''}
                {e.end_month ? ` · to ${monthLabel(e.end_month).replace(/ \d{4}$/, m => m.replace(' 20', " '"))}` : ''}
              </span>
              <span className="w-40 truncate text-xs italic text-slate-400" title="Words that spot it on a statement">{e.match || '—'}</span>
              <span className="flex gap-2 text-[11px]">
                <button onClick={() => setForm({ id: e.id, label: e.label, type: e.type, category: e.category, amount: e.amount != null ? String(e.amount) : '', every_months: String(e.every_months || 1), start_month: e.start_month || '', end_month: e.end_month || '', match: e.match || '' })} className="text-navy hover:underline dark:text-blue-300">Edit</button>
                <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-600">Remove</button>
              </span>
            </li>
          ))}
        </ul>
        {form && (
          <div className="grid gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-4 dark:border-slate-800">
            <div className="sm:col-span-2"><label className="field-label">Label</label><input value={form.label} onChange={x => setForm({ ...form, label: x.target.value })} className="field" placeholder="e.g. Rent from Luke" /></div>
            <div><label className="field-label">In or out</label><select value={form.type} onChange={x => setForm({ ...form, type: x.target.value })} className="field"><option value="Income">Money in</option><option value="Expense">Money out</option></select></div>
            <div><label className="field-label">Category</label><select value={form.category} onChange={x => setForm({ ...form, category: x.target.value })} className="field">{cats.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="field-label">Amount (blank = varies)</label><input type="number" step="0.01" value={form.amount} onChange={x => setForm({ ...form, amount: x.target.value })} className="field" /></div>
            <div><label className="field-label">Every (months)</label><input type="number" min={1} max={12} value={form.every_months} onChange={x => setForm({ ...form, every_months: x.target.value })} className="field" /></div>
            <div><label className="field-label">From month</label><input type="month" value={form.start_month} onChange={x => setForm({ ...form, start_month: x.target.value })} className="field" /></div>
            <div><label className="field-label">Until month</label><input type="month" value={form.end_month} onChange={x => setForm({ ...form, end_month: x.target.value })} className="field" /></div>
            <div className="sm:col-span-3"><label className="field-label">Statement words (comma separated)</label><input value={form.match} onChange={x => setForm({ ...form, match: x.target.value })} className="field" placeholder="e.g. luke, sprague" /></div>
            <div className="flex items-end gap-2"><button onClick={save} className="btn-primary">Save</button><button onClick={() => setForm(null)} className="btn-secondary">Cancel</button></div>
            <p className="text-[11px] text-slate-400 sm:col-span-4">A rent change: set &quot;Until&quot; on the old line and add a new one &quot;From&quot; the month it starts, so past months still check against the old amount.</p>
          </div>
        )}
      </div>

      <div className="card card-body"><PersonalKeyDates slug={slug} /></div>

      <EditValues p={p} onSaved={load} />
    </div>
  );
}

function Fact({ title, lines }: { title: string; lines: (string | null | undefined)[] }) {
  return (
    <div className="card card-body">
      <p className="section-label mb-1">{title}</p>
      {lines.filter(Boolean).map((l, i) => <p key={i} className={i === 0 ? 'text-sm font-semibold text-slate-900 dark:text-slate-100' : 'text-xs text-slate-500'}>{l}</p>)}
    </div>
  );
}
