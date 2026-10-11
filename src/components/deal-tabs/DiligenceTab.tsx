'use client';

import { useEffect, useState } from 'react';
import { Deal, fmt, daysUntil, ddChipColor } from '@/lib/utils';
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

export const STATUS_STYLE: Record<DdStatus, string> = {
  open: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  na: 'bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
};

const COST_STYLE: Record<CostStatus, string> = {
  proposal: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  signed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  invoiced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  declined: 'bg-gray-50 text-gray-400 line-through dark:bg-gray-800 dark:text-gray-500',
};

const input = 'text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200';

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

  if (active === null) return <p className="text-xs text-gray-400 py-8 text-center">Loading…</p>;

  if (!active && !items.length && !costs.length) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-400 dark:text-gray-500">The diligence checklist starts once the PSA is signed (Under Contract).</p>
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
      <div className="flex flex-wrap gap-2 mb-3">
        {deal.dd_expiry && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ddChipColor(ddDays)}`}>
            DD {deal.dd_expiry}{ddDays != null && ddDays >= 0 ? ` · ${ddDays}d` : ''}
          </span>
        )}
        {deal.close_date && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ddChipColor(closeDays)}`}>
            Close {deal.close_date}{closeDays != null && closeDays >= 0 ? ` · ${closeDays}d` : ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Progress label="Checklist" {...main} />
        <Progress label="Ownership materials" {...om} />
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
        {(['checklist', 'costs'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${
              view === v ? 'bg-white dark:bg-surface text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
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
              <h4 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-500 mb-1.5">Other email updates</h4>
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
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] text-gray-600 dark:text-gray-300">{label}</span>
        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{done}/{total}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-amber rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
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
      <div className="flex items-baseline justify-between mb-1.5">
        <h4 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-500 dark:text-gray-400">{section}</h4>
        <span className="font-mono text-[10px] text-gray-400">{done}/{total}</span>
      </div>
      <div className="border border-gray-100 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
        {rows.map(row => {
          const header = isOm && row.grp !== lastGrp ? row.grp : null;
          lastGrp = row.grp;
          return (
            <div key={row.id}>
              {header && <p className="px-3 pt-2 pb-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">{header}</p>}
              <ChecklistRow row={row} compact={isOm} legacy={legacy.filter(l => l.item_key === row.item_key)} onSave={onSave} onChanged={onChanged} />
            </div>
          );
        })}
        <div className="flex gap-2 px-3 py-1.5">
          <input
            value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="+ Add a line"
            className="text-xs flex-1 bg-transparent focus:outline-none text-gray-600 dark:text-gray-300 placeholder:text-gray-400"
          />
          {adding && <button onClick={add} className="text-[11px] text-amber font-medium">Add</button>}
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
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer shrink-0 ${STATUS_STYLE[value]}`}
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
      <div className="flex items-start gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => setOpen(o => !o)}>
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${row.status === 'done' ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
            {row.label}
            {row.due_date && <span className="ml-1.5 font-mono text-[10px] text-gray-400">due {row.due_date}</span>}
          </p>
          {!open && summary && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{summary}</p>}
          {!open && !compact && legacy.length > 0 && (
            <p className="text-[10px] text-navy dark:text-blue-300 truncate">✉ {legacy.flatMap(l => l.items.map(i => i.label)).join(' · ') || legacy[0].vendor}</p>
          )}
        </div>
        <StatusSelect value={row.status} onChange={s => onSave(row.id, { status: s })} />
      </div>
      {open && (
        <div className="px-3 pb-2.5 space-y-1.5 bg-gray-50/60 dark:bg-gray-800/30">
          <div className="grid grid-cols-[1fr_120px] gap-1.5 pt-1.5">
            <input defaultValue={row.vendor ?? ''} onBlur={blur('vendor')} placeholder="Vendor / who" className={input} />
            <input type="date" defaultValue={row.due_date ?? ''} onBlur={blur('due_date')} className={input} />
          </div>
          <textarea defaultValue={row.note ?? ''} onBlur={blur('note')} rows={2} placeholder="Where it stands" className={`${input} resize-y`} />
          {legacy.map((l, i) => <LegacyBlock key={i} note={l} />)}
          {custom && <button onClick={remove} className="text-[10px] text-red-500 hover:underline">Remove line</button>}
        </div>
      )}
    </div>
  );
}

function LegacyBlock({ note }: { note: LegacyNote }) {
  return (
    <div className="text-[11px] text-gray-600 dark:text-gray-300 border-l-2 border-navy/30 pl-2 py-0.5">
      <p className="text-[10px] text-gray-400">From email{note.vendor ? ` · ${note.vendor}` : ''}{note.due_date ? ` · due ${note.due_date}` : ''}</p>
      {note.items.map((it, i) => (
        <p key={i}>
          <span className={it.status === 'complete' ? 'text-green-600' : it.status === 'in-progress' ? 'text-blue-600' : 'text-gray-400'}>●</span> {it.label}
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
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          ['Proposed', totals.proposed],
          ['Committed', totals.committed],
          ['Invoiced', totals.invoiced],
          ['Paid', totals.paid],
        ].map(([label, v]) => (
          <div key={label as string} className="border border-gray-100 dark:border-gray-700 rounded-md px-2 py-1.5">
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-xs font-mono font-semibold text-gray-900 dark:text-gray-100">{fmt(v as number)}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mb-3">Committed = signed, invoiced and paid. Each line counts its invoice once there is one, else its proposal. Declined bids don&apos;t count.</p>

      <div className="border border-gray-100 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 mb-4">
        {costs.map(c => <CostRow key={c.id} cost={c} onChanged={onChanged} />)}
        {!costs.length && <p className="text-xs text-gray-400 px-3 py-3">No proposals yet. Add one below.</p>}
      </div>

      <div className="border border-dashed border-gray-200 dark:border-gray-600 rounded-lg p-2.5 space-y-1.5">
        <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-500">Add proposal</p>
        <div className="grid grid-cols-[110px_1fr_100px] gap-1.5">
          <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={input}>
            {COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input value={draft.vendor} onChange={e => setDraft({ ...draft, vendor: e.target.value })} placeholder="Vendor" className={input} />
          <input value={draft.proposal_amount} onChange={e => setDraft({ ...draft, proposal_amount: e.target.value.replace(/[$,]/g, '') })} onKeyDown={e => e.key === 'Enter' && add()} placeholder="$ amount" inputMode="decimal" className={`${input} font-mono`} />
        </div>
        <button onClick={add} className="px-3 py-1 text-xs bg-navy text-white rounded hover:bg-navy/90">Add</button>
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
      <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => setOpen(o => !o)}>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-800 dark:text-gray-200">{c.category}{c.vendor && <span className="text-gray-500 dark:text-gray-400"> · {c.vendor}</span>}</p>
          {c.notes && !open && <p className="text-[10px] text-gray-400 truncate">{c.notes}</p>}
        </div>
        <span className={`font-mono text-xs ${c.status === 'declined' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{fmt(costAmount(c))}</span>
        <select
          value={c.status}
          onClick={e => e.stopPropagation()}
          onChange={e => save({ status: e.target.value })}
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer ${COST_STYLE[c.status]}`}
        >
          {COST_STATUSES.map(s => <option key={s} value={s}>{COST_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {open && (
        <div className="px-3 pb-2.5 pt-1 space-y-1.5 bg-gray-50/60 dark:bg-gray-800/30">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] text-gray-500">Vendor<input defaultValue={c.vendor ?? ''} onBlur={blur('vendor')} className={input} /></label>
            <label className="text-[10px] text-gray-500">Category
              <select defaultValue={c.category} onChange={e => save({ category: e.target.value })} className={input}>
                {Array.from(new Set([...COST_CATEGORIES, c.category])).map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-gray-500">Proposal $<input defaultValue={c.proposal_amount ?? ''} onBlur={blur('proposal_amount', true)} inputMode="decimal" className={`${input} font-mono`} /></label>
            <label className="text-[10px] text-gray-500">Invoice $<input defaultValue={c.invoice_amount ?? ''} onBlur={blur('invoice_amount', true)} inputMode="decimal" className={`${input} font-mono`} /></label>
            <label className="text-[10px] text-gray-500">Paid on<input type="date" defaultValue={c.paid_date ?? ''} onBlur={blur('paid_date')} className={input} /></label>
          </div>
          <input defaultValue={c.notes ?? ''} onBlur={blur('notes')} placeholder="Notes (scope, split with partner, …)" className={input} />
          <button onClick={remove} className="text-[10px] text-red-500 hover:underline">Delete line</button>
        </div>
      )}
    </div>
  );
}
