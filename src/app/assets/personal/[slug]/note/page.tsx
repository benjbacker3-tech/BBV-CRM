'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { EMERSON_CONSTRUCTION, NOTE, NotePayment, PersonalProperty, SALE_COST_PCT, fmtDay, todayIso, usd } from '@/lib/personal';
import { EditValues, Line } from '@/components/PersonalBits';

type Resp = {
  stats: { original: number; rate: number; monthly: number; term: number; balance: number; paidCount: number; interestEarned: number };
  payments: NotePayment[];
  schedule: { n: number; principal: number; interest: number; balance: number }[];
};

// Emerson: Dan's note (payments, balance, schedule), Ben's position, and the sale waterfall.
export default function Note() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Resp | null>(null);
  const [p, setP] = useState<PersonalProperty | null>(null);
  const [form, setForm] = useState({ date: todayIso(), amount: String(NOTE.monthly) });
  const [busy, setBusy] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [sale, setSale] = useState(0);

  const load = useCallback(async () => {
    const [d, prop] = await Promise.all([fetch('/api/personal/note').then(r => r.json()), fetch(`/api/personal/${slug}`).then(r => r.json())]);
    setData(d);
    setP(prop);
    setSale(s => s || prop.est_value);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const log = async () => {
    setBusy(true);
    await fetch('/api/personal/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: form.date, amount: parseFloat(form.amount) }) });
    setForm({ date: todayIso(), amount: String(NOTE.monthly) });
    await load();
    setBusy(false);
  };

  if (!data || !p) return <p className="text-xs text-slate-400">Loading…</p>;
  const { stats } = data;
  const afterLoan = sale - sale * SALE_COST_PCT - p.loan_balance;
  const afterDan = afterLoan - EMERSON_CONSTRUCTION - stats.balance;
  const position = (p.est_value - p.loan_balance) * 0.5 + EMERSON_CONSTRUCTION + stats.balance;

  return (
    <div className="space-y-5">
      <h1 className="page-title">Dan&apos;s Note</h1>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {[
          ['Original', usd(stats.original)], ['Rate', `${(stats.rate * 100).toFixed(2)}%`], ['Monthly', usd(stats.monthly)],
          ['Balance', usd(stats.balance)], ['Paid', `${stats.paidCount} of ${stats.term}`], ['Interest earned', usd(stats.interestEarned)],
        ].map(([l, v]) => <div key={l} className="stat !py-2.5"><p className="stat-label">{l}</p><p className="stat-value !text-base">{v}</p></div>)}
      </div>

      <div className="card card-body">
        <p className="card-title mb-3">Log payment</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="field-label">Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="field" /></div>
          <div><label className="field-label">Amount</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="field !w-32" /></div>
          <button onClick={log} disabled={busy} className="btn-primary">Log payment</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="card-header"><p className="card-title">Recent payments</p><span className="text-[11px] text-slate-400">last 12 of {data.payments.length}</span></div>
        <table className="table-clean">
          <thead><tr><th>Date</th><th className="!text-right">Payment</th><th className="!text-right">Principal</th><th className="!text-right">Interest</th><th className="!text-right">Balance</th></tr></thead>
          <tbody>
            {[...data.payments].reverse().slice(0, 12).map(x => (
              <tr key={x.id} className="row"><td>{fmtDay(x.date)}</td><td className="num">{usd(x.amount)}</td><td className="num">{usd(x.principal)}</td><td className="num text-navy">{usd(x.interest)}</td><td className="num font-semibold">{usd(x.balance_after)}</td></tr>
            ))}
            {data.payments.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">No payments logged.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <button onClick={() => setShowSchedule(s => !s)} className="card-header w-full text-left"><p className="card-title">Full {stats.term}-month amortization</p><span className="text-xs text-slate-400">{showSchedule ? 'Hide' : 'Show'}</span></button>
        {showSchedule && (
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead><tr><th>#</th><th className="!text-right">Principal</th><th className="!text-right">Interest</th><th className="!text-right">Balance</th></tr></thead>
              <tbody>
                {data.schedule.map(r => (
                  <tr key={r.n} className={`row ${r.n <= stats.paidCount ? 'text-slate-400' : ''} ${r.n === stats.paidCount + 1 ? 'bg-navy/5' : ''}`}>
                    <td>{r.n}</td><td className="num">{usd(r.principal)}</td><td className="num">{usd(r.interest)}</td><td className="num">{usd(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditValues p={p} onSaved={load} />

      <div className="card card-body">
        <p className="card-title mb-2">Ben&apos;s position</p>
        <Line label={`50% of equity (${usd(p.est_value)} − ${usd(p.loan_balance)})`} v={usd((p.est_value - p.loan_balance) * 0.5)} />
        <Line label="+ Construction receivable" v={usd(EMERSON_CONSTRUCTION)} />
        <Line label="+ Dan's note balance" v={usd(stats.balance)} />
        <Line label="Total position" v={usd(position)} strong />
      </div>

      <div className="card card-body">
        <p className="card-title mb-2">Sale waterfall</p>
        <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Sale price</span><b>{usd(sale)}</b></div>
        <input type="range" min={900000} max={2000000} step={25000} value={sale} onChange={e => setSale(parseInt(e.target.value))} className="my-2 w-full" />
        <Line label={`− ${SALE_COST_PCT * 100}% closing`} v={`−${usd(sale * SALE_COST_PCT)}`} />
        <Line label="− loan payoff" v={`−${usd(p.loan_balance)}`} />
        <Line label="Net" v={usd(afterLoan)} strong />
        <Line label="− Ben's construction, off the top" v={`−${usd(EMERSON_CONSTRUCTION)}`} />
        <Line label="− Dan's note payoff" v={`−${usd(stats.balance)}`} />
        <Line label="Remaining, split 50/50" v={usd(afterDan)} />
        <Line label="Ben total proceeds" v={usd(EMERSON_CONSTRUCTION + afterDan / 2)} strong me />
      </div>
    </div>
  );
}
