'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PersonalTx, fmtDay, usd } from '@/lib/personal';

// Every dollar in and out for a year: totals by category (for taxes) and the full list.
export default function Ledger() {
  const { slug } = useParams<{ slug: string }>();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<{ years: string[]; tx: PersonalTx[] } | null>(null);

  const load = useCallback(async (y: string) => setData(await fetch(`/api/personal/${slug}/ledger?year=${y}`).then(r => r.json())), [slug]);
  useEffect(() => { load(year); }, [load, year]);

  const byCat = useMemo(() => {
    const m = new Map<string, { income: number; expense: number }>();
    for (const t of data?.tx || []) {
      const r = m.get(t.category) || { income: 0, expense: 0 };
      if (t.type === 'Income') r.income += t.amount; else r.expense += t.amount;
      m.set(t.category, r);
    }
    return Array.from(m.entries()).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense));
  }, [data]);

  if (!data) return <p className="text-xs text-slate-400">Loading…</p>;
  const income = data.tx.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
  const expense = data.tx.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
  const years = data.years.includes(year) ? data.years : [year, ...data.years];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Ledger</h1>
        <div className="segmented">
          {years.map(y => <button key={y} onClick={() => setYear(y)} className={`segment ${y === year ? 'segment-active' : ''}`}>{y}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat"><p className="stat-label">Income</p><p className="stat-value text-emerald-700">{usd(income)}</p></div>
        <div className="stat"><p className="stat-label">Expenses</p><p className="stat-value text-red-700">{usd(expense)}</p></div>
        <div className="stat"><p className="stat-label">Net</p><p className="stat-value">{usd(income - expense)}</p></div>
      </div>

      {byCat.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="card-header"><p className="card-title">By category · {year}</p></div>
          <table className="table-clean">
            <thead><tr><th>Category</th><th className="!text-right">Income</th><th className="!text-right">Expense</th><th className="!text-right">Net</th></tr></thead>
            <tbody>
              {byCat.map(([c, v]) => (
                <tr key={c} className="row"><td className="font-medium text-slate-800">{c}</td><td className="num">{v.income ? usd(v.income) : '—'}</td><td className="num">{v.expense ? usd(v.expense) : '—'}</td><td className="num font-semibold">{usd(v.income - v.expense)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="card-header"><p className="card-title">Transactions</p><span className="count">{data.tx.length}</span></div>
        {data.tx.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing recorded in {year}.</p> : (
          <table className="table-clean">
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="!text-right">Amount</th></tr></thead>
            <tbody>
              {data.tx.map(t => (
                <tr key={t.id} className="row align-top" title={t.notes || undefined}>
                  <td className="whitespace-nowrap text-slate-500">{fmtDay(t.date)}</td>
                  <td className="text-slate-800">{t.description}{t.notes && <span className="block text-[11px] text-slate-400">{t.notes}</span>}</td>
                  <td><span className="pill pill-slate">{t.category}</span></td>
                  <td className={`num font-semibold ${t.type === 'Income' ? 'text-emerald-700' : 'text-red-700'}`}>{t.type === 'Income' ? '+' : '−'}{usd(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
