'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CLAYTON_OWNERS, PersonalProperty, SALE_COST_PCT, usd } from '@/lib/personal';
import { EditValues, Line } from '@/components/PersonalBits';

// Clayton ownership: each owner's equity today and a sale waterfall.
export default function Ownership() {
  const { slug } = useParams<{ slug: string }>();
  const [p, setP] = useState<PersonalProperty | null>(null);
  const [sale, setSale] = useState(0);

  const load = useCallback(async () => {
    const d: PersonalProperty = await fetch(`/api/personal/${slug}`).then(r => r.json());
    setP(d);
    setSale(s => s || d.est_value);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  if (!p) return <p className="text-xs text-slate-400">Loading…</p>;
  const equity = p.est_value - p.loan_balance;
  const net = sale - sale * SALE_COST_PCT - p.loan_balance;

  return (
    <div className="space-y-5">
      <h1 className="page-title">Ownership</h1>
      <div className="card overflow-x-auto">
        <table className="table-clean">
          <thead><tr><th>Owner</th><th className="!text-right">%</th><th className="!text-right">Contributed</th><th className="!text-right">Equity today</th><th className="!text-right">Gain</th></tr></thead>
          <tbody>
            {CLAYTON_OWNERS.map(o => {
              const eq = equity * (o.pct / 100);
              const gain = eq - o.contributed;
              return (
                <tr key={o.name} className={`row ${o.me ? 'bg-navy/5' : ''}`}>
                  <td className="font-medium text-slate-900">{o.name}</td>
                  <td className="num">{o.pct}%</td>
                  <td className="num">{usd(o.contributed)}</td>
                  <td className="num font-semibold">{usd(eq)}</td>
                  <td className={`num font-semibold ${gain >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{gain >= 0 ? '+' : ''}{usd(gain)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EditValues p={p} onSaved={load} />

      <div className="card card-body">
        <p className="card-title mb-2">Sale waterfall</p>
        <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Sale price</span><b>{usd(sale)}</b></div>
        <input type="range" min={500000} max={1200000} step={10000} value={sale} onChange={e => setSale(parseInt(e.target.value))} className="my-2 w-full" />
        <Line label="Sale price" v={usd(sale)} />
        <Line label={`− ${SALE_COST_PCT * 100}% closing`} v={`−${usd(sale * SALE_COST_PCT)}`} />
        <Line label="− loan payoff" v={`−${usd(p.loan_balance)}`} />
        <Line label="Net proceeds" v={usd(net)} strong />
        <div className="mt-2 space-y-0.5">
          {CLAYTON_OWNERS.map(o => <Line key={o.name} label={`${o.name} (${o.pct}%)`} v={usd(Math.max(0, net) * (o.pct / 100))} me={o.me} />)}
        </div>
      </div>
    </div>
  );
}
