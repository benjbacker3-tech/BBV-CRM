'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AuditMonth, AuditRow, Expected, LEDGER_CATEGORIES, MONTHS_SHORT, MonthState, NOTE_CATEGORY, PersonalProperty, StatementLine,
  currentMonth, fmtDay, monthLabel, todayIso, usd,
} from '@/lib/personal';

type Imp = { id: string; file_name: string; first_date: string | null; last_date: string | null; lines: number; balanced: number | null; imported_at: string };
type Resp = { property: PersonalProperty; year: string; months: AuditMonth[]; expected: Expected[]; imports: Imp[]; owed: { category: string; owed: number }[] };
type ImportResult = { lines: number; added: number; linked: number; posted: number; review: number; duplicates: number; balanced: boolean | null; first: string | null; last: string | null; error?: string };

const STATE: Record<MonthState, { box: string; label: string }> = {
  closed: { box: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'Closed' },
  issues: { box: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300', label: 'Needs a look' },
  ready: { box: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300', label: 'Ready to close' },
  open: { box: 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300', label: 'In progress' },
  future: { box: 'border-dashed border-slate-200 bg-transparent text-slate-400 dark:border-slate-700', label: 'Not yet' },
  empty: { box: 'border-dashed border-slate-200 bg-transparent text-slate-400 dark:border-slate-700', label: 'Not tracked' },
};
const ROW_PILL: Record<AuditRow['status'], [string, string]> = {
  ok: ['pill-green', 'Matches'], differs: ['pill-amber', 'Amount differs'], missing: ['pill-red', 'Missing'],
  skipped: ['pill-slate', 'Skipped'], upcoming: ['pill-slate', 'Not yet'],
};

// Monthly audit: did this month do what the property should? Rent in, mortgage out, Dan's
// payment, utility bills — checked against the ledger, which bank statements fill.
export default function MonthlyAudit() {
  const { slug } = useParams<{ slug: string }>();
  const [year, setYear] = useState(currentMonth().slice(0, 4));
  const [data, setData] = useState<Resp | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const d: Resp = await fetch(`/api/personal/${slug}/audit?year=${year}`).then(r => r.json());
    setData(d);
    setMonth(m => (m && m.startsWith(year) ? m : pickMonth(d.months)));
  }, [slug, year]);
  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(`/api/personal/${slug}/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
    if (r.error) alert(r.error);
    await load();
    setBusy(false);
    return r;
  };

  const upload = async (file: File) => {
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    const r: ImportResult = await fetch(`/api/personal/${slug}/statements`, { method: 'POST', body: fd }).then(x => x.json()).catch(() => ({ error: 'Upload failed' } as ImportResult));
    setResult(r);
    if (!r.error && r.last) { setYear(r.last.slice(0, 4)); setMonth(r.last.slice(0, 7)); }
    await load();
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!data) return <p className="text-xs text-slate-400">Loading…</p>;
  const p = data.property;
  const m = data.months.find(x => x.month === month) ?? null;
  const ready = data.months.filter(x => x.state === 'ready').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{p.name}</h1>
          <p className="page-sub">{p.address}{p.entity ? ` · ${p.entity}` : ''} · {p.bank_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.pdf,text/csv,application/pdf" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary" title={`A ${p.bank_name} statement: CSV download, or the PDF`}>
            {busy ? 'Working…' : 'Import statement'}
          </button>
        </div>
      </div>

      {result && <ImportBanner r={result} onClose={() => setResult(null)} />}

      {/* The year at a glance */}
      <div className="card card-body">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(String(Number(year) - 1))} className="btn-secondary !px-2 !py-0.5">‹</button>
            <span className="px-2 font-mono text-sm font-semibold">{year}</span>
            <button onClick={() => setYear(String(Number(year) + 1))} className="btn-secondary !px-2 !py-0.5">›</button>
          </div>
          {ready > 0 && (
            <button onClick={() => act({ action: 'close-ready', year })} disabled={busy} className="btn-secondary !py-1 !text-xs">
              Close {ready} ready month{ready === 1 ? '' : 's'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {data.months.map((x, i) => {
            const issues = x.rows.filter(r => r.status === 'missing' || r.status === 'differs').length + x.uncategorized;
            return (
              <button key={x.month} onClick={() => setMonth(x.month)}
                className={`rounded-lg border px-1 py-2 text-center transition ${STATE[x.state].box} ${x.month === month ? 'ring-2 ring-navy ring-offset-1 dark:ring-blue-300 dark:ring-offset-slate-900' : ''}`}>
                <span className="block text-xs font-semibold">{MONTHS_SHORT[i]}</span>
                <span className="block text-[10px]">{x.state === 'closed' ? '✓' : x.state === 'issues' ? `${issues} to fix` : x.state === 'ready' ? 'ready' : x.state === 'open' ? '…' : '–'}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {(['closed', 'ready', 'issues', 'open'] as MonthState[]).map(s => <span key={s} className="flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-sm border ${STATE[s].box}`} />{STATE[s].label}</span>)}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        {m ? <MonthPanel key={m.month} slug={slug} m={m} busy={busy} act={act} reload={load} /> : <div />}
        <aside className="space-y-4">
          <div className="card card-body">
            <p className="section-label mb-1.5">Tenant owes for utilities</p>
            {data.owed.length === 0 ? <p className="text-xs text-slate-500">All recharged.</p> : data.owed.map(o => (
              <p key={o.category} className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{o.category}</span><span className={`font-mono ${o.owed > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{usd(o.owed)}</span></p>
            ))}
            <p className="mt-1.5 text-[11px] text-slate-400">Bills paid minus recharges received, all time.</p>
          </div>
          <div className="card card-body">
            <p className="section-label mb-1.5">Statements imported</p>
            {data.imports.length === 0 ? <p className="text-xs text-slate-500">None yet. Download the month&apos;s statement from {p.bank_name} (CSV is best; PDF works too) and click Import statement.</p> : (
              <ul className="space-y-1.5">
                {data.imports.map(i => (
                  <li key={i.id} className="text-xs">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-200" title={i.file_name}>{i.file_name}</p>
                    <p className="text-slate-500">{i.first_date ? `${fmtDay(i.first_date)} – ${fmtDay(i.last_date)}` : ''} · {i.lines} lines · {i.balanced === 1 ? <span className="text-emerald-700">balances ✓</span> : i.balanced === 0 ? <span className="text-red-600">balances don&apos;t add up</span> : 'no balances'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// The month to open first: the latest one that needs a look, else this month, else December.
function pickMonth(months: AuditMonth[]): string {
  const issues = months.filter(x => x.state === 'issues');
  if (issues.length) return issues[issues.length - 1].month;
  const now = currentMonth();
  return months.find(x => x.month === now)?.month ?? months[months.length - 1].month;
}

function ImportBanner({ r, onClose }: { r: ImportResult; onClose: () => void }) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${r.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'}`}>
      <div>
        {r.error ? r.error : (
          <>
            <b>Imported {r.lines} lines</b> ({r.first ? `${fmtDay(r.first)} – ${fmtDay(r.last)}` : ''}).{' '}
            {r.linked > 0 && <>{r.linked} already in the ledger · </>}
            {r.posted > 0 && <>{r.posted} filed automatically · </>}
            {r.review > 0 ? <b>{r.review} need a category</b> : 'nothing left to file'}
            {r.duplicates > 0 && <> · {r.duplicates} were already imported</>}
            {r.balanced === false && <p className="mt-1 font-semibold text-red-700">The running balances don&apos;t add up: a line may be missing from the file.</p>}
            {r.balanced === true && <span className="ml-1 text-emerald-700">· balances check out ✓</span>}
          </>
        )}
      </div>
      <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

function MonthPanel({ slug, m, busy, act, reload }: { slug: string; m: AuditMonth; busy: boolean; act: (b: Record<string, unknown>) => Promise<unknown>; reload: () => Promise<void> }) {
  const [notes, setNotes] = useState(m.notes ?? '');
  const [showFiled, setShowFiled] = useState(false);
  const waiting = m.lines.filter(l => l.status === 'new');
  const filed = m.lines.filter(l => l.status !== 'new');
  const issues = m.rows.filter(r => r.status === 'missing' || r.status === 'differs').length + m.uncategorized;
  const past = m.month < currentMonth();

  const close = () => {
    if (issues && !confirm(`${issues} item${issues === 1 ? '' : 's'} still need a look. Close ${monthLabel(m.month)} anyway?`)) return;
    act({ action: 'close', month: m.month });
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="card-title">{monthLabel(m.month)}</p>
          <p className="text-[11px] text-slate-500">{STATE[m.state].label}{m.closedAt ? ` · closed ${fmtDay(m.closedAt)}` : ''} · in {usd(m.income)} · out {usd(m.expense)}</p>
        </div>
        {m.state === 'closed'
          ? <button onClick={() => act({ action: 'reopen', month: m.month })} disabled={busy} className="btn-secondary !py-1 !text-xs">Reopen</button>
          : (past || m.state === 'ready') && <button onClick={close} disabled={busy} className="btn-primary !py-1 !text-xs">Close month</button>}
      </div>

      <div className="px-4 py-3">
        <p className="section-label mb-1.5">What should have happened</p>
        {m.rows.length === 0 ? <p className="text-xs text-slate-500">No expected lines this month. Set them up on the Property tab.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {m.rows.map(r => <ExpectedRow key={r.expected.id} r={r} month={m.month} busy={busy} act={act} locked={m.state === 'closed'} />)}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <p className="section-label mb-1.5">Bank statement</p>
        {m.lines.length === 0 ? (
          <p className="text-xs text-slate-500">{past ? 'No statement imported for this month yet.' : 'Nothing imported for this month yet.'}</p>
        ) : (
          <>
            {waiting.length > 0 && (
              <>
                <p className="mb-1 text-xs font-semibold text-amber-700">{waiting.length} line{waiting.length === 1 ? '' : 's'} need a category</p>
                <ul className="mb-2 divide-y divide-slate-100 rounded-lg border border-amber-200 dark:divide-slate-800 dark:border-amber-900">
                  {waiting.map(l => <LineRow key={l.id} slug={slug} l={l} reload={reload} />)}
                </ul>
              </>
            )}
            {filed.length > 0 && (
              <button onClick={() => setShowFiled(s => !s)} className="text-xs font-medium text-navy hover:underline dark:text-blue-300">
                {showFiled ? 'Hide' : 'Show'} {filed.length} filed line{filed.length === 1 ? '' : 's'}
              </button>
            )}
            {showFiled && (
              <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
                {filed.map(l => <LineRow key={l.id} slug={slug} l={l} reload={reload} />)}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <label className="field-label">Notes for {monthLabel(m.month)}</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (m.notes ?? '') && act({ action: 'notes', month: m.month, notes })}
          rows={2} className="field !text-sm" placeholder="Anything your CPA or future you should know about this month…" />
      </div>
    </div>
  );
}

function ExpectedRow({ r, month, busy, act, locked }: { r: AuditRow; month: string; busy: boolean; act: (b: Record<string, unknown>) => Promise<unknown>; locked: boolean }) {
  const [form, setForm] = useState<{ date: string; amount: string } | null>(null);
  const e = r.expected;
  const [pill, label] = ROW_PILL[r.status];
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`w-14 shrink-0 text-[10px] font-bold uppercase tracking-wide ${e.type === 'Income' ? 'text-emerald-700' : 'text-slate-500'}`}>{e.type === 'Income' ? 'In' : 'Out'}</span>
        <span className="min-w-[160px] flex-1 font-medium text-slate-800 dark:text-slate-200">{e.label}</span>
        <span className="w-24 text-right font-mono text-xs text-slate-500">{e.amount != null ? usd(e.amount) : 'varies'}</span>
        <span className="w-32 text-right font-mono text-xs text-slate-800 dark:text-slate-200">{r.actual != null ? <>{usd(r.actual)}<span className="ml-1 font-sans text-[10px] text-slate-400">{r.date ? fmtDay(r.date).replace(/, \d{4}$/, '') : ''}</span></> : ''}</span>
        <span className={`pill ${pill} w-28 justify-center`}>{label}</span>
        {!locked && (
          <span className="flex w-28 justify-end gap-2 text-[11px]">
            {(r.status === 'missing' || r.status === 'upcoming') && <>
              <button onClick={() => setForm({ date: `${month}-${month === currentMonth() ? todayIso().slice(8) : '01'}`, amount: e.amount != null ? String(e.amount) : '' })} className="text-navy hover:underline dark:text-blue-300">Record</button>
              <button onClick={() => { const note = prompt(`Why doesn't "${e.label}" apply to this month? (optional)`); if (note !== null) act({ action: 'skip', month, expected_id: e.id, note }); }} className="text-slate-500 hover:underline">Skip</button>
            </>}
            {r.status === 'skipped' && <button onClick={() => act({ action: 'unskip', month, expected_id: e.id })} className="text-slate-500 hover:underline">Undo skip</button>}
          </span>
        )}
      </div>
      {r.status === 'skipped' && r.note && <p className="ml-[68px] text-[11px] italic text-slate-500">{r.note}</p>}
      {r.status === 'differs' && e.amount != null && r.actual != null && (
        <p className="ml-[68px] text-[11px] text-amber-700">{usd(Math.abs(r.actual - e.amount))} {r.actual > e.amount ? 'more' : 'less'} than expected. If the amount changed for good, update it on the Property tab.</p>
      )}
      {form && (
        <div className="ml-[68px] mt-1.5 flex flex-wrap items-end gap-2">
          <div><label className="field-label">Date</label><input type="date" value={form.date} onChange={x => setForm({ ...form, date: x.target.value })} className="field !py-1" /></div>
          <div><label className="field-label">Amount</label><input type="number" step="0.01" value={form.amount} onChange={x => setForm({ ...form, amount: x.target.value })} className="field !w-28 !py-1" /></div>
          <button disabled={busy || !form.date || !(Number(form.amount) > 0)} onClick={async () => { await act({ action: 'confirm', month, expected_id: e.id, date: form.date, amount: Number(form.amount) }); setForm(null); }} className="btn-primary !py-1 !text-xs">Save</button>
          <button onClick={() => setForm(null)} className="btn-secondary !py-1 !text-xs">Cancel</button>
          <p className="w-full text-[10px] text-slate-400">For a payment that didn&apos;t go through the bank account, or before you import the statement.</p>
        </div>
      )}
    </li>
  );
}

function LineRow({ slug, l, reload }: { slug: string; l: StatementLine; reload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const note = l.tx_id?.startsWith('note:');
  const options = [...LEDGER_CATEGORIES, ...(slug === 'emerson' ? [NOTE_CATEGORY] : [])];
  const file = async (category: string) => {
    if (!category) return;
    setSaving(true);
    const r = await fetch(`/api/personal/${slug}/statements/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, remember: true }) }).then(x => x.json());
    if (r.error) alert(r.error);
    await reload();
    setSaving(false);
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-xs">
      <span className="w-12 shrink-0 font-mono text-slate-500">{l.date.slice(5).replace('-', '/')}</span>
      <span className="min-w-[180px] flex-1 truncate text-slate-800 dark:text-slate-200" title={l.description}>{l.description}</span>
      <span className={`w-24 text-right font-mono ${l.amount > 0 ? 'text-emerald-700' : 'text-slate-700 dark:text-slate-300'}`}>{l.amount > 0 ? '+' : '−'}{usd(Math.abs(l.amount)).replace('$', '$')}</span>
      {note ? <span className="w-40 text-right text-[11px] text-slate-500">{NOTE_CATEGORY}</span> : (
        <select value={l.category ?? ''} disabled={saving} onChange={e => file(e.target.value)} className={`field !w-40 !py-0.5 !text-xs ${l.status === 'new' ? '!border-amber-300' : ''}`}
          title="Files this line, and remembers the payee for next month">
          {l.status === 'new' && <option value="">Choose…</option>}
          {options.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {l.status === 'linked' && <span className="text-[10px] text-slate-400" title="This payment was already in the ledger">matched</span>}
    </li>
  );
}
