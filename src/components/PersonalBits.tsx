'use client';

import { useState } from 'react';
import { PersonalProperty } from '@/lib/personal';

// Small pieces shared by the personal property pages.

export function Line({ label, v, strong, me }: { label: string; v: string; strong?: boolean; me?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${strong ? 'mt-1 border-t border-slate-200 pt-1 font-semibold text-slate-900' : me ? 'font-semibold text-emerald-700' : 'text-slate-600'}`}>
      <span>{label}</span><span className="font-mono tabular-nums">{v}</span>
    </div>
  );
}

// Estimated value and loan balance, which drive the equity and waterfall math.
export function EditValues({ p, onSaved }: { p: PersonalProperty; onSaved: () => void }) {
  const [est, setEst] = useState(String(p.est_value));
  const [loan, setLoan] = useState(String(p.loan_balance));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await fetch(`/api/personal/${p.slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ est_value: parseFloat(est), loan_balance: parseFloat(loan) }) });
    await onSaved();
    setBusy(false);
  };
  return (
    <div className="card card-body">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1"><label className="field-label">Estimated property value</label><input type="number" value={est} onChange={e => setEst(e.target.value)} className="field" /></div>
        <div className="flex-1"><label className="field-label">Loan balance</label><input type="number" value={loan} onChange={e => setLoan(e.target.value)} className="field" /></div>
        <button onClick={save} disabled={busy} className="btn-primary">Save</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Used in the equity and sale math on this page.</p>
    </div>
  );
}
