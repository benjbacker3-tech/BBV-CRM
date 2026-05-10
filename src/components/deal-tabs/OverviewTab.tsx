'use client';

import { useState, useEffect, useRef } from 'react';
import { Deal, STAGES, fmt, fmtNum } from '@/lib/utils';

interface Props {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
}

// YoC + occupancy are stored as decimals (0.082 = 8.2%); we edit as percentages.
const toPct = (v: number | null | undefined) => ((v ?? 0) * 100);
const fromPct = (v: number | string) => (typeof v === 'string' ? parseFloat(v) || 0 : v) / 100;

type SaveStatus = 'idle' | 'saving' | 'saved';

export default function OverviewTab({ deal, onUpdate }: Props) {
  const [editingAll, setEditingAll] = useState(false);
  const [allForm, setAllForm] = useState(() => ({
    ...deal,
    yoc_initial: toPct(deal.yoc_initial),
    yoc_target: toPct(deal.yoc_target),
    occupancy: toPct(deal.occupancy),
  }));

  // Inline-editable fields (live; auto-save)
  const [stage, setStage] = useState(deal.stage);
  const [ddExpiry, setDdExpiry] = useState(deal.dd_expiry || '');
  const [closeDate, setCloseDate] = useState(deal.close_date || '');
  const [notes, setNotes] = useState(deal.notes || '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const notesTimer = useRef<NodeJS.Timeout | null>(null);

  // Re-sync local state when the deal prop changes (e.g. when selecting a different deal)
  useEffect(() => {
    setStage(deal.stage);
    setDdExpiry(deal.dd_expiry || '');
    setCloseDate(deal.close_date || '');
    setNotes(deal.notes || '');
    setAllForm({
      ...deal,
      yoc_initial: toPct(deal.yoc_initial),
      yoc_target: toPct(deal.yoc_target),
      occupancy: toPct(deal.occupancy),
    });
    setEditingAll(false);
  }, [deal]);

  // PATCH a single field via the existing PUT route (it accepts partial payloads)
  // Loosely typed because we pass nullable values for fields the strict Deal type marks required
  const saveField = async (patch: Record<string, unknown>) => {
    setSaveStatus('saving');
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdate(updated);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } else {
      setSaveStatus('idle');
    }
  };

  const onStageChange = (value: string) => {
    setStage(value as Deal['stage']);
    saveField({ stage: value as Deal['stage'] });
  };
  const onDdExpiryChange = (value: string) => {
    setDdExpiry(value);
    saveField({ dd_expiry: value || null });
  };
  const onCloseDateChange = (value: string) => {
    setCloseDate(value);
    saveField({ close_date: value || null });
  };
  const onNotesChange = (value: string) => {
    setNotes(value);
    // Debounce so we don't spam saves while typing
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => saveField({ notes: value || null }), 800);
  };
  const onNotesBlur = () => {
    if (notesTimer.current) {
      clearTimeout(notesTimer.current);
      notesTimer.current = null;
      saveField({ notes });
    }
  };

  // -------------------------------------------------------------------------
  // Bulk edit mode (everything at once)
  // -------------------------------------------------------------------------
  const saveAll = async () => {
    const payload = {
      ...allForm,
      yoc_initial: fromPct(allForm.yoc_initial),
      yoc_target: fromPct(allForm.yoc_target),
      occupancy: fromPct(allForm.occupancy),
    };
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const updated = await res.json();
    onUpdate(updated);
    setEditingAll(false);
  };

  if (editingAll) return <BulkEditForm form={allForm} setForm={setAllForm} onSave={saveAll} onCancel={() => setEditingAll(false)} />;

  // -------------------------------------------------------------------------
  // Default view: quick-edit at top, read-only details below
  // -------------------------------------------------------------------------
  const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200";

  const landSF = (deal.acreage || 0) * 43560;
  const plf = landSF > 0 ? (deal.asking_price || 0) / landSF : 0;
  const far = landSF > 0 ? (deal.sf || 0) / landSF : 0;

  const detailGroups: { label: string; items: { label: string; value: string; mono?: boolean }[] }[] = [
    { label: 'Property', items: [
      { label: 'City', value: deal.city || '—' },
      { label: 'Market', value: deal.market || '—' },
      { label: 'Submarket', value: deal.submarket || '—' },
      { label: 'Zoning', value: deal.zoning || '—' },
    ]},
    { label: 'Specs', items: [
      { label: 'Building SF', value: deal.sf ? fmtNum(deal.sf, 0) : '—', mono: true },
      { label: 'Acres', value: deal.acreage ? fmtNum(deal.acreage, 2) : '—', mono: true },
      { label: 'FAR', value: far ? far.toFixed(2) : '—', mono: true },
      { label: 'Occupancy', value: deal.occupancy ? `${Math.round((deal.occupancy) * 100)}%` : '—', mono: true },
    ]},
    { label: 'Basis & Returns', items: [
      { label: 'Asking Price', value: fmt(deal.asking_price), mono: true },
      { label: '$ / LSF', value: plf ? `$${plf.toFixed(2)}` : '—', mono: true },
      { label: 'Initial YoC', value: deal.yoc_initial ? `${(deal.yoc_initial * 100).toFixed(1)}%` : '—', mono: true },
      { label: 'Stab YoC', value: deal.yoc_target ? `${(deal.yoc_target * 100).toFixed(1)}%` : '—', mono: true },
      { label: 'Equity Required', value: deal.equity_required ? fmt(deal.equity_required) : '—', mono: true },
    ]},
    { label: 'Transaction Terms', items: [
      { label: 'DD Period', value: deal.dd_days ? `${deal.dd_days} days` : '—', mono: true },
      { label: 'Close Window', value: deal.close_days ? `${deal.close_days} days` : '—', mono: true },
      { label: 'Deposit', value: deal.deposit ? fmt(deal.deposit) : '—', mono: true },
      { label: 'Source', value: deal.source || '—' },
    ]},
  ];

  return (
    <div className="space-y-5">
      {/* QUICK EDIT — always editable, auto-saves */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 font-semibold">Quick Edit</h5>
          <SaveIndicator status={saveStatus} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Stage</label>
            <select value={stage} onChange={e => onStageChange(e.target.value)} className={inputCls + ' font-medium'}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">DD Expiration</label>
            <input type="date" value={ddExpiry} onChange={e => onDdExpiryChange(e.target.value)} className={inputCls + ' font-mono'} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Closing</label>
            <input type="date" value={closeDate} onChange={e => onCloseDateChange(e.target.value)} className={inputCls + ' font-mono'} />
          </div>
        </div>
      </section>

      {/* NOTES — auto-saves on debounce/blur */}
      <section>
        <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 font-semibold mb-2">Notes</h5>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          onBlur={onNotesBlur}
          rows={5}
          placeholder="Add notes about this deal…"
          className={inputCls + ' leading-relaxed'}
        />
      </section>

      {/* DETAILS — read-only with one Edit All button */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 font-semibold">Details</h5>
          <button onClick={() => setEditingAll(true)} className="text-xs text-amber hover:text-amber-dark font-medium">
            Edit all fields
          </button>
        </div>
        <div className="space-y-4">
          {detailGroups.map(g => (
            <div key={g.label}>
              <h6 className="text-[9px] uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500 font-semibold mb-1">{g.label}</h6>
              <div className="space-y-1">
                {g.items.map(f => (
                  <div key={f.label} className="flex justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{f.label}</span>
                    <span className={`text-xs text-gray-900 dark:text-gray-100 ${f.mono ? 'font-mono tabular-nums' : ''}`}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className={`text-[10px] flex items-center gap-1 ${status === 'saved' ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
      {status === 'saving' ? (
        <>
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M12 4v4m0 8v4m8-8h-4m-8 0H4m11.314-5.314l-2.828 2.828m-4.972 4.972l-2.828 2.828m11.314 0l-2.828-2.828m-4.972-4.972L5.686 5.686" />
          </svg>
          Saving…
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Saved
        </>
      )}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Bulk edit mode — full form for the less-frequently-edited fields
// -----------------------------------------------------------------------------

interface BulkForm extends Omit<Deal, 'yoc_initial' | 'yoc_target' | 'occupancy'> {
  yoc_initial: number; // percent
  yoc_target: number;  // percent
  occupancy: number;   // percent
}

function BulkEditForm({ form, setForm, onSave, onCancel }: {
  form: BulkForm;
  setForm: (f: BulkForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200";

  const groups: { label: string; fields: { key: keyof BulkForm; label: string; type?: string; step?: string; colSpan?: 1 | 2 }[] }[] = [
    { label: 'Property', fields: [
      { key: 'name', label: 'Name', colSpan: 2 },
      { key: 'address', label: 'Address', colSpan: 2 },
      { key: 'city', label: 'City' },
      { key: 'market', label: 'Market' },
      { key: 'submarket', label: 'Submarket' },
      { key: 'zoning', label: 'Zoning' },
    ]},
    { label: 'Specs', fields: [
      { key: 'sf', label: 'SF (Building)', type: 'number', step: '1' },
      { key: 'acreage', label: 'Acres', type: 'number', step: '0.01' },
      { key: 'occupancy', label: 'Occupancy (%)', type: 'number', step: '1' },
    ]},
    { label: 'Basis & Returns', fields: [
      { key: 'asking_price', label: 'Asking Price ($)', type: 'number', step: '10000' },
      { key: 'yoc_initial', label: 'Initial YoC (%)', type: 'number', step: '0.1' },
      { key: 'yoc_target', label: 'Stab YoC (%)', type: 'number', step: '0.1' },
      { key: 'equity_required', label: 'Equity Required ($)', type: 'number', step: '10000' },
    ]},
    { label: 'Transaction', fields: [
      { key: 'dd_days', label: 'DD Period (days)', type: 'number', step: '1' },
      { key: 'close_days', label: 'Close (days)', type: 'number', step: '1' },
      { key: 'deposit', label: 'Deposit ($)', type: 'number', step: '1000' },
      { key: 'source', label: 'Source' },
    ]},
  ];

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Editing all fields. Quick fields (stage, dates, notes) auto-save on the main view — use this for the less-common ones.
      </p>
      {groups.map(group => (
        <div key={group.label}>
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-2">{group.label}</h5>
          <div className="grid grid-cols-2 gap-2">
            {group.fields.map(({ key, label, type, step, colSpan }) => (
              <div key={key as string} className={colSpan === 2 ? 'col-span-2' : ''}>
                <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-0.5">{label}</label>
                <input
                  type={type || 'text'}
                  step={step}
                  value={(form as unknown as Record<string, unknown>)[key as string] as string | number ?? ''}
                  onChange={e => setForm({ ...form, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-surface pb-2">
        <button onClick={onSave} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Save</button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
      </div>
    </div>
  );
}
