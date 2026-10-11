'use client';

import { useEffect, useState } from 'react';
import { Deal, fmt, daysUntil, ddPill, shortDate } from '@/lib/utils';
import {
  DD_SECTIONS, DD_STATUSES, DD_STATUS_LABEL, DdItem, DdStatus, DdCost, OWNERSHIP_SECTION,
  COST_STATUSES, COST_STATUS_LABEL, COST_CATEGORIES, CostStatus, costAmount, costTotals,
} from '@/lib/dd-template';

interface LegacyNote {
  item_key: string | null;
  category: string;
  vendor: string | null;
  due_date: string | null;
  items: { label: string; status: string }[];
}

// Full pill classes (see the design system in globals.css).
export const STATUS_STYLE: Record<DdStatus, string> = {
  open: 'pill pill-slate',
  in_progress: 'pill pill-blue',
  done: 'pill pill-green',
  na: 'pill pill-muted',
};

const COST_STYLE: Record<CostStatus, string> = {
  proposal: 'pill pill-slate',
  signed: 'pill pill-blue',
  invoiced: 'pill pill-amber',
  paid: 'pill pill-green',
  declined: 'pill pill-muted line-through',
};

const input = 'field';

const progressOf = (rows: DdItem[]) => {
  const counted = rows.filter(r => r.status !== 'na');
  const done = counted.filter(r => r.status === 'done').length;
  return { done, total: counted.length, pct: counted.length ? Math.round((done / counted.length) * 100) : 0 };
};

export default function DiligenceTab({ deal }: { deal: Deal }) {
  const [view, setView] = useState<'checklist' | 'costs'>('checklist');
  const [active, setActive] = useState<boolean | null>(null);
  const [items, setItems] = useState<DdItem[]>([]);
  const [costs, setCosts] = useState<DdCost[]>([]);
  const [legacy, setLegacy] = useState<LegacyNote[]>([]);

  const load = () =>
    fetch(`/api/dd?deal_id=${deal.id}`).then(r => r.json()).then(data => {
      setActive(!!data.active);
      setItems(data.items || []);
      setCosts(data.costs || []);
      setLegacy(data.legacy || []);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [deal.id, deal.stage]);

  if (active === null) return <p className="text-xs text-slate-400 py-8 text-center">Loading…</p>;

  if (!active && !items.length && !costs.length) {
    return (
      <div className="card text-center py-8 px-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">The diligence checklist starts once the PSA is signed (Under Contract).</p>
      </div>
    );
  }

  const saveItem = async (id: number, patch: Partial<DdItem>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
    await fetch(`/api/dd/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  };

  const checklist = items.filter(i => i.section !== OWNERSHIP_SECTION);
  const owned = items.filter(i => i.section === OWNERSHIP_SECTION);
  const main = progressOf(checklist);
  const om = progressOf(owned);
  const totals = costTotals(costs);
  const ddDays = daysUntil(deal.dd_expiry);
  const closeDays = daysUntil(deal.close_date);

  return (
    <div>
      {/* Dates + progress */}
      <div className="card p-3.5 mb-4">
        {(deal.dd_expiry || deal.close_date) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {deal.dd_expiry && (
              <span className={ddPill(ddDays)}>
                DD <span className="font-mono">{shortDate(deal.dd_expiry)}</span>{ddDays != null && ddDays >= 0 ? ` · ${ddDays}d left` : ''}
              </span>
            )}
            {deal.close_date && (
              <span className={ddPill(closeDays)}>
                Close <span className="font-mono">{shortDate(deal.close_date)}</span>{closeDays != null && closeDays >= 0 ? ` · ${closeDays}d` : ''}
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Progress label="Checklist" {...main} />
          <Progress label="Ownership materials" {...om} />
        </div>
      </div>

      <div className="segmented w-full mb-4">
        {(['checklist', 'costs'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`segment flex-1 ${view === v ? 'segment-active' : ''}`}
          >
            {v === 'checklist' ? 'Checklist' : `Costs · ${fmt(totals.committed)}`}
          </button>
        ))}
      </div>

      {view === 'checklist' ? (
        <div className="space-y-5">
          {DD_SECTIONS.map(section => (
            <ChecklistSection
              key={section}
              section={section}
              dealId={deal.id}
              rows={items.filter(i => i.section === section)}
              legacy={legacy}
              onSave={saveItem}
              onChanged={load}
            />
          ))}
          {legacy.some(l => !l.item_key) && (
            <div>
              <h4 className="section-label mb-2">Other email updates</h4>
              {legacy.filter(l => !l.item_key).map((l, i) => <LegacyBlock key={i} note={l} />)}
            </div>
          )}
        </div>
      ) : (
        <CostsView dealId={deal.id} costs={costs} onChanged={load} />
      )}
    </div>
  );
}

export function Progress({ label, done, total, pct }: { label: string; done: number; total: number; pct: number }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{done}/{total} · {pct}%</span>
      </div>
      <div className="progress">
        <span className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ChecklistSection({ section, dealId, rows, legacy, onSave, onChanged }: {
  section: string;
  dealId: number;
  rows: DdItem[];
  legacy: LegacyNote[];
  onSave: (id: number, patch: Partial<DdItem>) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState('');
  const isOm = section === OWNERSHIP_SECTION;
  const { done, total } = progressOf(rows);
  let lastGrp: string | null = null;

  const add = async () => {
    if (!adding.trim()) return;
    await fetch('/api/dd', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, section, label: adding, grp: isOm ? rows[rows.length - 1]?.grp ?? null : null }),
    });
    setAdding('');
    onChanged();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="section-label">{section}</h4>
        <span className="count">{done}/{total}</span>
      </div>
      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(row => {
          const header = isOm && row.grp !== lastGrp ? row.grp : null;
          lastGrp = row.grp;
          return (
            <div key={row.id}>
              {header && <p className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">{header}</p>}
              <ChecklistRow row={row} compact={isOm} legacy={legacy.filter(l => l.item_key === row.item_key)} onSave={onSave} onChanged={onChanged} />
            </div>
          );
        })}
        <div className="flex gap-2 px-3 py-2 bg-slate-50/50 dark:bg-slate-800/30">
          <input
            value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="+ Add a line"
            className="text-xs flex-1 bg-transparent focus:outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
          />
          {adding && <button onClick={add} className="btn-primary !py-0.5 !px-2">Add</button>}
        </div>
      </div>
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: DdStatus; onChange: (s: DdStatus) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as DdStatus)}
      onClick={e => e.stopPropagation()}
      className={`${STATUS_STYLE[value]} cursor-pointer shrink-0 appearance-none text-center focus:outline-none`}
    >
      {DD_STATUSES.map(s => <option key={s} value={s}>{DD_STATUS_LABEL[s]}</option>)}
    </select>
  );
}

function ChecklistRow({ row, compact, legacy, onSave, onChanged }: {
  row: DdItem;
  compact: boolean;
  legacy: LegacyNote[];
  onSave: (id: number, patch: Partial<DdItem>) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const custom = row.item_key.startsWith('custom-');
  const blur = (field: 'vendor' | 'note' | 'due_date') => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value.trim() || null;
    if (v !== (row[field] ?? null)) onSave(row.id, { [field]: v });
  };
  const remove = async () => {
    await fetch(`/api/dd/items/${row.id}`, { method: 'DELETE' });
    onChanged();
  };
  const summary = [row.vendor, row.note].filter(Boolean).join(' · ');

  return (
    <div className={row.status === 'na' ? 'opacity-60' : ''}>
      <div className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="flex-1 min-w-0">
          <p className={`text-[12.5px] leading-snug ${row.status === 'done' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
            {row.label}
            {row.due_date && <span className={`ml-2 ${row.status === 'done' ? 'pill pill-muted' : ddPill(daysUntil(row.due_date))}`}>due <span className="font-mono">{shortDate(row.due_date)}</span></span>}
          </p>
          {!open && summary && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{summary}</p>}
          {!open && !compact && legacy.length > 0 && (
            <p className="text-[10px] text-navy dark:text-blue-300 truncate">✉ {legacy.flatMap(l => l.items.map(i => i.label)).join(' · ') || legacy[0].vendor}</p>
          )}
        </div>
        <StatusSelect value={row.status} onChange={s => onSave(row.id, { status: s })} />
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-[1fr_130px] gap-2 pt-1.5">
            <input defaultValue={row.vendor ?? ''} onBlur={blur('vendor')} placeholder="Vendor / who" className={input} />
            <input type="date" defaultValue={row.due_date ?? ''} onBlur={blur('due_date')} className={input} />
          </div>
          <textarea defaultValue={row.note ?? ''} onBlur={blur('note')} rows={2} placeholder="Where it stands" className={`${input} resize-y`} />
          {legacy.map((l, i) => <LegacyBlock key={i} note={l} />)}
          {custom && <button onClick={remove} className="btn-danger !px-0 !py-0 text-[11px]">Remove line</button>}
        </div>
      )}
    </div>
  );
}

function LegacyBlock({ note }: { note: LegacyNote }) {
  return (
    <div className="text-[11px] text-slate-600 dark:text-slate-300 border-l-2 border-navy/30 pl-2.5 py-0.5">
      <p className="text-[10px] text-slate-400">From email{note.vendor ? ` · ${note.vendor}` : ''}{note.due_date ? ` · due ${note.due_date}` : ''}</p>
      {note.items.map((it, i) => (
        <p key={i}>
          <span className={it.status === 'complete' ? 'text-green-600' : it.status === 'in-progress' ? 'text-blue-600' : 'text-slate-400'}>●</span> {it.label}
        </p>
      ))}
    </div>
  );
}

// ── Costs ───────────────────────────────────────────────────────────────

function CostsView({ dealId, costs, onChanged }: { dealId: number; costs: DdCost[]; onChanged: () => void }) {
  const [draft, setDraft] = useState({ category: 'Legal', vendor: '', proposal_amount: '' });
  const totals = costTotals(costs);

  const add = async () => {
    await fetch('/api/dd/costs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, ...draft }),
    });
    setDraft({ category: draft.category, vendor: '', proposal_amount: '' });
    onChanged();
  };

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {[
          ['Proposed', totals.proposed],
          ['Committed', totals.committed],
          ['Invoiced', totals.invoiced],
          ['Paid', totals.paid],
        ].map(([label, v]) => (
          <div key={label as string} className="card px-2.5 py-2">
            <p className="stat-label">{label}</p>
            <p className="mt-0.5 text-[13px] font-mono font-semibold text-slate-900 dark:text-slate-100">{fmt(v as number)}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-400 mb-4">Committed = signed, invoiced and paid. Each line counts its invoice once there is one, else its proposal. Declined bids don&apos;t count.</p>

      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 mb-4">
        {costs.map(c => <CostRow key={c.id} cost={c} onChanged={onChanged} />)}
        {!costs.length && <p className="text-xs text-slate-400 px-3 py-4 text-center">No proposals yet. Add one below.</p>}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3 space-y-2">
        <p className="section-label">Add proposal</p>
        <div className="grid grid-cols-[110px_1fr_100px] gap-2">
          <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={input}>
            {COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input value={draft.vendor} onChange={e => setDraft({ ...draft, vendor: e.target.value })} placeholder="Vendor" className={input} />
          <input value={draft.proposal_amount} onChange={e => setDraft({ ...draft, proposal_amount: e.target.value.replace(/[$,]/g, '') })} onKeyDown={e => e.key === 'Enter' && add()} placeholder="$ amount" inputMode="decimal" className={`${input} font-mono`} />
        </div>
        <button onClick={add} className="btn-primary">Add proposal</button>
      </div>
    </div>
  );
}

function CostRow({ cost: c, onChanged }: { cost: DdCost; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const save = async (patch: Record<string, unknown>) => {
    await fetch(`/api/dd/costs/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    onChanged();
  };
  const blur = (field: keyof DdCost, money = false) => (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = money ? e.target.value.replace(/[$,]/g, '') : e.target.value;
    const v = raw.trim() === '' ? null : money ? Number(raw) : raw.trim();
    if (v !== (c[field] ?? null)) save({ [field]: v });
  };
  const remove = async () => {
    if (!confirm(`Delete the ${c.category} line?`)) return;
    await fetch(`/api/dd/costs/${c.id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div>
      <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200">{c.category}{c.vendor && <span className="font-normal text-slate-500 dark:text-slate-400"> · {c.vendor}</span>}</p>
          {c.notes && !open && <p className="text-[10px] text-slate-400 truncate">{c.notes}</p>}
        </div>
        <span className={`font-mono text-xs ${c.status === 'declined' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'}`}>{fmt(costAmount(c))}</span>
        <select
          value={c.status}
          onClick={e => e.stopPropagation()}
          onChange={e => save({ status: e.target.value })}
          className={`${COST_STYLE[c.status]} cursor-pointer appearance-none text-center focus:outline-none`}
        >
          {COST_STATUSES.map(s => <option key={s} value={s}>{COST_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-2 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2">
            <label className="field-label">Vendor<input defaultValue={c.vendor ?? ''} onBlur={blur('vendor')} className={input} /></label>
            <label className="field-label">Category
              <select defaultValue={c.category} onChange={e => save({ category: e.target.value })} className={input}>
                {Array.from(new Set([...COST_CATEGORIES, c.category])).map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="field-label">Proposal $<input defaultValue={c.proposal_amount ?? ''} onBlur={blur('proposal_amount', true)} inputMode="decimal" className={`${input} font-mono`} /></label>
            <label className="field-label">Invoice $<input defaultValue={c.invoice_amount ?? ''} onBlur={blur('invoice_amount', true)} inputMode="decimal" className={`${input} font-mono`} /></label>
            <label className="field-label">Paid on<input type="date" defaultValue={c.paid_date ?? ''} onBlur={blur('paid_date')} className={input} /></label>
          </div>
          <input defaultValue={c.notes ?? ''} onBlur={blur('notes')} placeholder="Notes (scope, split with partner, …)" className={input} />
          <button onClick={remove} className="btn-danger !px-0 !py-0 text-[11px]">Delete line</button>
        </div>
      )}
    </div>
  );
}
