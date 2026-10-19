'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { LEDGER_CATEGORIES, NON_OPERATING, PersonalProperty, PersonalTx, fmtDay, todayIso, usd } from '@/lib/personal';
import type { TaxYear } from '@/lib/personal-audit';

type Resp = { property: PersonalProperty; summary: TaxYear; tx: PersonalTx[]; years: string[] };

// Tax year: the year's numbers in Schedule E order, cash flow, the CPA document checklist, an
// Excel export, and the ledger behind it all.
export default function TaxYearPage() {
  const { slug } = useParams<{ slug: string }>();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<Resp | null>(null);
  const [interest, setInterest] = useState('');

  const load = useCallback(async () => {
    const d: Resp = await fetch(`/api/personal/${slug}/tax?year=${year}`).then(r => r.json());
    setData(d);
    setInterest(d.summary.interestFrom1098 ? String(d.summary.mortgageInterest) : '');
  }, [slug, year]);
  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    await fetch(`/api/personal/${slug}/tax`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, ...body }) });
    await load();
  };

  if (!data) return <p className="text-xs text-slate-400">Loading…</p>;
  const s = data.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{data.property.name} · {year}</h1>
          <p className="page-sub">{s.monthsClosed} of 12 months audited{s.monthsWithIssues ? ` · ${s.monthsWithIssues} need a look` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(e.target.value)} className="field !w-28 !py-1.5">
            {data.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <a href={`/api/personal/${slug}/tax/export?year=${year}`} className="btn-primary">Export for CPA</a>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card">
          <div className="card-header"><p className="card-title">Schedule E · rental income and expenses</p></div>
          <div className="space-y-1 px-4 py-3 text-sm">
            <Row label="Rents received" v={s.rents} />
            {s.otherIncome !== 0 && <Row label="Other income" v={s.otherIncome} />}
            <p className="section-label !mt-3">Expenses</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-300">
                Mortgage interest {s.interestFrom1098 ? <span className="pill pill-green ml-1">from 1098</span> : <span className="pill pill-amber ml-1">estimate</span>}
              </span>
              <span className="flex items-center gap-2">
                <input type="number" step="0.01" value={interest} placeholder={String(s.interestEstimate)} onChange={e => setInterest(e.target.value)}
                  onBlur={() => patch({ mortgage_interest: interest === '' ? null : Number(interest) })} className="field !w-32 !py-0.5 text-right font-mono !text-xs" title="Enter box 1 of the 1098 when it arrives" />
              </span>
            </div>
            <Row label="Property taxes" v={s.taxes} />
            <Row label="Insurance" v={s.insurance} />
            <Row label={`Utilities, net of tenant reimbursements (${usd(s.utilitiesPaid)} − ${usd(s.recharges)})`} v={s.utilitiesNet} />
            <Row label="Repairs and maintenance" v={s.repairs} />
            {s.bankFees !== 0 && <Row label="Bank fees" v={s.bankFees} />}
            {s.other !== 0 && <Row label="Other" v={s.other} />}
            <Row label="Total expenses" v={s.totalExpenses} strong />
            <Row label="Net rental income" v={s.net} strong big />
            {s.share && <Row label={`Your share (${s.share.pct}% of TB Capital)`} v={s.share.net} me />}
            <p className="pt-1 text-[11px] text-slate-400">
              Before depreciation (your CPA handles that). Mortgage principal and escrow deposits aren&apos;t deductible, so the full payments sit below, under cash flow.
              {!s.interestFrom1098 && ' Interest is estimated from the loan balance and rate until you enter the 1098.'}
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card card-body text-sm">
            <p className="section-label mb-1.5">Cash flow (bank)</p>
            <Row label="Money in" v={s.cash.in} />
            <Row label="Money out" v={s.cash.out} />
            <Row label="Net cash flow" v={s.cash.net} strong />
            <p className="mt-2 text-[11px] text-slate-400">Mortgage payments made: {usd(s.mortgagePaid)}.{(s.owner.contributions || s.owner.draws) ? ` Owner contributions ${usd(s.owner.contributions)} · draws ${usd(s.owner.draws)} (kept out of income and expenses).` : ''}</p>
          </div>
          {s.note && (
            <div className="card card-body text-sm">
              <p className="section-label mb-1.5">Dan&apos;s note</p>
              <Row label={`Payments received (${s.note.payments})`} v={s.note.interest + s.note.principal} />
              <Row label="Interest (taxable to you)" v={s.note.interest} me />
              <Row label="Principal returned" v={s.note.principal} />
              <p className="mt-1 text-[11px] text-slate-400">Reported separately from the rental, as interest income.</p>
            </div>
          )}
          <div className="card card-body">
            <p className="section-label mb-1.5">For the CPA</p>
            <ul className="space-y-1.5">
              {s.docs.map(d => (
                <li key={d.name} className="text-sm">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={d.done} onChange={e => patch({ doc: d.name, done: e.target.checked })} className="mt-0.5" />
                    <span className={d.done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}>{d.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <Ledger slug={slug} tx={data.tx} reload={load} />
    </div>
  );
}

function Row({ label, v, strong, big, me }: { label: string; v: number; strong?: boolean; big?: boolean; me?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'mt-1 border-t border-slate-200 pt-1 font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100' : me ? 'font-semibold text-emerald-700' : 'text-slate-600 dark:text-slate-300'} ${big ? 'text-base' : ''}`}>
      <span>{label}</span><span className="font-mono tabular-nums">{usd(v)}</span>
    </div>
  );
}

// Every ledger entry for the year: re-file any of them, add one by hand, delete hand-added ones.
function Ledger({ slug, tx, reload }: { slug: string; tx: PersonalTx[]; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ date: todayIso(), description: '', category: 'Maintenance', type: 'Expense', amount: '' });
  const cats = Array.from(new Set(tx.map(t => t.category))).sort();
  const shown = filter ? tx.filter(t => t.category === filter) : tx;
  const send = async (method: string, body?: unknown, q = '') => {
    const r = await fetch(`/api/personal/${slug}/ledger${q}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(x => x.json());
    if (r.error) alert(r.error);
    await reload();
  };
  return (
    <div className="card">
      <div className="card-header">
        <p className="card-title">Ledger <span className="ml-1 font-normal text-slate-400">{shown.length}</span></p>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="field !w-40 !py-0.5 !text-xs">
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setAdding(a => !a)} className="btn-secondary !py-0.5 !text-xs">{adding ? 'Cancel' : 'Add entry'}</button>
        </div>
      </div>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div><label className="field-label">Date</label><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className="field !py-1" /></div>
          <div className="min-w-[200px] flex-1"><label className="field-label">Description</label><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className="field !py-1" placeholder="e.g. Furnace repair, paid personally" /></div>
          <div><label className="field-label">Type</label><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className="field !py-1"><option>Expense</option><option>Income</option></select></div>
          <div><label className="field-label">Category</label><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className="field !py-1">{LEDGER_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="field-label">Amount</label><input type="number" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} className="field !w-28 !py-1" /></div>
          <button disabled={!(Number(f.amount) > 0)} onClick={async () => { await send('POST', { ...f, amount: Number(f.amount) }); setAdding(false); setF({ ...f, description: '', amount: '' }); }} className="btn-primary !py-1">Add</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table-clean">
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="!text-right">Amount</th><th>Source</th><th /></tr></thead>
          <tbody>
            {shown.map(t => (
              <tr key={t.id} className="row">
                <td className="whitespace-nowrap font-mono text-xs">{fmtDay(t.date)}</td>
                <td className="max-w-[360px] truncate text-[13px]" title={t.notes || t.description}>{t.description}</td>
                <td>
                  <select value={t.category} onChange={e => send('PATCH', { id: t.id, category: e.target.value })} className="field !w-36 !py-0.5 !text-xs">
                    {Array.from(new Set([t.category, ...LEDGER_CATEGORIES])).map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td className={`num whitespace-nowrap ${NON_OPERATING.has(t.category) ? 'text-slate-400' : t.type === 'Income' ? 'text-emerald-700' : ''}`}>{t.type === 'Income' ? '+' : '−'}{usd(t.amount)}</td>
                <td className="text-[11px] text-slate-400">{sourceLabel(t.source)}</td>
                <td>{t.source === 'manual' && <button onClick={() => confirm('Delete this entry?') && send('DELETE', undefined, `?id=${t.id}`)} className="text-[11px] text-slate-400 hover:text-red-600">Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sourceLabel(s: string | null): string {
  if (!s) return 'imported';
  if (s.startsWith('statement:')) return 'statement';
  if (s.startsWith('utility:')) return 'utility bill';
  if (s === 'servicer-escrow') return 'escrow';
  if (s === 'dan-payment' || s === 'dan-payment-seed') return "Dan's note";
  return s;
}
