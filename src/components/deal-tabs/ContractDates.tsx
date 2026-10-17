'use client';

import { useMemo, useState } from 'react';
import { Deal, daysUntil, ddPill, fmt, shortDate } from '@/lib/utils';
import { Found, timeline } from '@/lib/contract-terms';

type Form = { psa_effective: string; dd_days: string; close_days: string; deposit: string; em_days: string; em_business: boolean; deposit_2: string };
const LABELS: Record<string, string> = {
  psa_effective: 'PSA effective date', dd_days: 'DD period (days)', close_days: 'Closing (days after DD)',
  close_days_after_effective: 'Closing (days after effective)', em_amount: 'Earnest money', em_days: 'EM due (days)', em_business: 'EM days are business days', price: 'Purchase price',
};
// The next two upcoming milestones for the collapsed header.
function summary(ms: ReturnType<typeof timeline>): string {
  if (!ms.length) return 'Add the PSA terms';
  const next = ms.filter(m => m.key !== 'effective' && (daysUntil(m.date) ?? -1) >= 0).slice(0, 2);
  return next.length ? next.map(m => `${m.label.split(' (')[0]} ${shortDate(m.date)}`).join(' · ') : 'All contract dates have passed';
}
const num = (s: string) => (s.trim() === '' ? null : Number(s));

// The PSA's terms and the dates they set: DD expiry, deposits, closing. Saving moves the deal's
// DD and closing dates and the diligence checklist's due dates (lines dated by hand stay put).
export default function ContractDates({ deal, onSaved }: { deal: Deal; onSaved: (d: Deal) => void }) {
  const [open, setOpen] = useState(!deal.psa_effective);
  const [f, setF] = useState<Form>({
    psa_effective: deal.psa_effective ?? '', dd_days: deal.dd_days ? String(deal.dd_days) : '', close_days: deal.close_days ? String(deal.close_days) : '',
    deposit: deal.deposit ? String(deal.deposit) : '', em_days: deal.em_days != null ? String(deal.em_days) : '3', em_business: (deal.em_business ?? 1) === 1,
    deposit_2: deal.deposit_2 ? String(deal.deposit_2) : '',
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [read, setRead] = useState<{ file: { name: string; webUrl: string } | null; scanned: boolean; found: Found; error?: string } | null>(null);
  const [reading, setReading] = useState(false);

  const ms = useMemo(() => timeline({
    psa_effective: f.psa_effective || null, dd_days: num(f.dd_days), close_days: num(f.close_days),
    em_days: num(f.em_days), em_business: f.em_business ? 1 : 0, deposit: num(f.deposit), deposit_2: num(f.deposit_2),
  }), [f]);

  const save = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        psa_effective: f.psa_effective || null, dd_days: num(f.dd_days) ?? 0, close_days: num(f.close_days) ?? 0,
        deposit: num(f.deposit) ?? 0, em_days: num(f.em_days), em_business: f.em_business ? 1 : 0, deposit_2: num(f.deposit_2),
      }),
    });
    setBusy(false);
    if (!res.ok) { setNote('Could not save.'); return; }
    onSaved(await res.json());
    setNote(f.psa_effective ? 'Saved. DD expiry, closing and checklist due dates updated.' : 'Saved. Add the PSA effective date to set the dates.');
  };

  const readPsa = async () => {
    setReading(true);
    setRead(null);
    try { setRead(await fetch(`/api/deals/${deal.id}/psa`).then(r => r.json())); } finally { setReading(false); }
  };
  const apply = (k: string, v: unknown) => {
    setF(prev => {
      const n = { ...prev };
      if (k === 'psa_effective') n.psa_effective = String(v);
      if (k === 'dd_days') n.dd_days = String(v);
      if (k === 'close_days') n.close_days = String(v);
      if (k === 'em_amount') n.deposit = String(v);
      if (k === 'em_days') n.em_days = String(v);
      if (k === 'em_business') n.em_business = !!v;
      return n;
    });
  };

  const field = (k: keyof Form, label: string, type = 'number', ph = '') => (
    <div>
      <label className="field-label">{label}</label>
      <input type={type} value={f[k] as string} placeholder={ph} onChange={e => setF({ ...f, [k]: e.target.value })} className="field" />
    </div>
  );

  return (
    <section className="card mb-4">
      <button onClick={() => setOpen(o => !o)} className="card-header w-full text-left">
        <p className="card-title">Contract dates</p>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          {summary(ms)}
          <span className="text-slate-400">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {ms.length > 0 && (
        <ul className="divide-y divide-slate-100 border-b border-slate-100">
          {ms.map(m => {
            const d = daysUntil(m.date);
            return (
              <li key={m.key} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                <span className={`${d != null && d < 0 ? 'pill pill-slate' : ddPill(d)} w-20 shrink-0 justify-center font-mono`}>{shortDate(m.date)}</span>
                <span className="flex-1 text-slate-800">{m.label}</span>
                {m.amount ? <span className="font-mono text-xs text-slate-600">{fmt(m.amount)}</span> : null}
                <span className="w-16 text-right text-[11px] text-slate-400">{d == null ? '' : d < 0 ? 'passed' : d === 0 ? 'today' : `${d}d`}</span>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {field('psa_effective', 'PSA effective date', 'date')}
            {field('dd_days', 'DD period (days)', 'number', '45')}
            {field('close_days', 'Closing (days after DD)', 'number', '30')}
            {field('deposit', 'Earnest money ($)', 'number')}
            <div>
              <label className="field-label">EM due (days after effective)</label>
              <div className="flex items-center gap-2">
                <input type="number" value={f.em_days} onChange={e => setF({ ...f, em_days: e.target.value })} className="field !w-20" />
                <label className="flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={f.em_business} onChange={e => setF({ ...f, em_business: e.target.checked })} /> business days</label>
              </div>
            </div>
            {field('deposit_2', 'Additional deposit at DD ($)', 'number')}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save dates'}</button>
            <button onClick={readPsa} disabled={reading} className="btn-secondary" title="Find the PSA in this deal's OneDrive folder and suggest its terms">{reading ? 'Reading PSA…' : 'Read PSA'}</button>
            {note && <span className="text-[11px] text-slate-600">{note}</span>}
          </div>
          <p className="text-[10px] leading-relaxed text-slate-400">
            Weekend deadlines move to the next business day. Checklist lines get due dates from these milestones (e.g. reports and title 10 days before DD expiry, final wire the day before closing). Lines you dated yourself are left alone.
          </p>

          {read && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px]">
              {read.error ? <p className="text-red-600">{read.error}</p>
                : !read.file ? <p className="text-slate-600">No PSA found in this deal&apos;s OneDrive folder (looked for a PDF named PSA / purchase agreement / contract).</p>
                : read.scanned ? <p className="text-slate-600">Found <a href={read.file.webUrl} target="_blank" rel="noopener noreferrer" className="underline">{read.file.name}</a>, but it&apos;s a scan with no readable text. Enter the terms above by hand.</p>
                : Object.keys(read.found).length === 0 ? <p className="text-slate-600">Read <a href={read.file.webUrl} target="_blank" rel="noopener noreferrer" className="underline">{read.file.name}</a> but couldn&apos;t find the terms in its text (state forms keep them in fill-in fields). Enter them by hand.</p>
                : (
                  <>
                    <p className="mb-1.5 text-slate-600">From <a href={read.file.webUrl} target="_blank" rel="noopener noreferrer" className="underline">{read.file.name}</a>. Check each against the quote, then use it:</p>
                    <ul className="space-y-1.5">
                      {Object.entries(read.found).map(([k, v]) => (
                        <li key={k} className="flex items-start gap-2">
                          <button onClick={() => apply(k, v!.value)} disabled={!['psa_effective', 'dd_days', 'close_days', 'em_amount', 'em_days', 'em_business'].includes(k)}
                            className="btn-secondary !px-2 !py-0.5 !text-[11px] shrink-0 disabled:opacity-40" title={k === 'price' || k === 'close_days_after_effective' ? 'For reference' : 'Put this in the form'}>Use</button>
                          <span>
                            <b className="text-slate-800">{LABELS[k] ?? k}: {k === 'em_amount' || k === 'price' ? fmt(v!.value as number) : k === 'em_business' ? (v!.value ? 'yes' : 'no') : String(v!.value)}</b>
                            <span className="block text-[11px] italic leading-snug text-slate-500">“…{v!.quote}…”</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
