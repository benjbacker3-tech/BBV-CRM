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
    irr: toPct(deal.irr),
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
      irr: toPct(deal.irr),
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
      irr: fromPct(allForm.irr),
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
    <div className="space-y-6">
      {/* QUICK EDIT — always editable, auto-saves */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="section-label">Quick Edit</h5>
          <SaveIndicator status={saveStatus} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="field-label">Stage</label>
            <select value={stage} onChange={e => onStageChange(e.target.value)} className="field font-medium">
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">DD Expiration</label>
            <input type="date" value={ddExpiry} onChange={e => onDdExpiryChange(e.target.value)} className="field font-mono tabular-nums" />
          </div>
          <div>
            <label className="field-label">Closing</label>
            <input type="date" value={closeDate} onChange={e => onCloseDateChange(e.target.value)} className="field font-mono tabular-nums" />
          </div>
        </div>
      </section>

      {/* NOTES — auto-saves on debounce/blur */}
      <section>
        <h5 className="section-label mb-2">Notes</h5>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          onBlur={onNotesBlur}
          rows={5}
          placeholder="Add notes about this deal…"
          className="field leading-relaxed"
        />
      </section>

      {/* DETAILS — read-only with one Edit All button */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="section-label">Details</h5>
          <button onClick={() => setEditingAll(true)} className="btn-ghost -mr-2">
            Edit all fields
          </button>
        </div>
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {detailGroups.map(g => (
            <div key={g.label} className="px-3 py-2.5">
              <h6 className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400 dark:text-slate-500 mb-1.5">{g.label}</h6>
              <dl className="space-y-1">
                {g.items.map(f => (
                  <div key={f.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{f.label}</dt>
                    <dd className={`text-[13px] text-right text-slate-800 dark:text-slate-100 ${f.mono ? 'font-mono tabular-nums' : ''}`}>{f.value}</dd>
                  </div>
                ))}
              </dl>
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
    <span className={`text-[10px] flex items-center gap-1 ${status === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
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

interface BulkForm extends Omit<Deal, 'yoc_initial' | 'yoc_target' | 'occupancy' | 'irr'> {
  yoc_initial: number; // percent
  yoc_target: number;  // percent
  occupancy: number;   // percent
  irr: number;         // percent
}

function BulkEditForm({ form, setForm, onSave, onCancel }: {
  form: BulkForm;
  setForm: (f: BulkForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const groups: { label: string; fields: { key: keyof BulkForm; label: string; type?: string; step?: string; colSpan?: 1 | 2 }[] }[] = [
    { label: 'Property', fields: [
      { key: 'name', label: 'Name', colSpan: 2 },
      { key: 'address', label: 'Address', colSpan: 2 },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State (2-letter)' },
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
      { key: 'all_in_basis', label: 'All-In Basis ($)', type: 'number', step: '10000' },
      { key: 'yoc_initial', label: 'Initial YoC (%)', type: 'number', step: '0.1' },
      { key: 'yoc_target', label: 'Stab YoC (%)', type: 'number', step: '0.1' },
      { key: 'irr', label: 'IRR (%)', type: 'number', step: '0.1' },
      { key: 'em', label: 'Equity Multiple (x)', type: 'number', step: '0.01' },
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
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        Editing all fields. Quick fields (stage, dates, notes) auto-save on the main view — use this for the less-common ones.
      </p>
      {groups.map(group => (
        <section key={group.label}>
          <h5 className="section-label mb-2">{group.label}</h5>
          <div className="grid grid-cols-2 gap-3">
            {group.fields.map(({ key, label, type, step, colSpan }) => (
              <div key={key as string} className={colSpan === 2 ? 'col-span-2' : ''}>
                <label className="field-label">{label}</label>
                <input
                  type={type || 'text'}
                  step={step}
                  value={(form as unknown as Record<string, unknown>)[key as string] as string | number ?? ''}
                  onChange={e => setForm({ ...form, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className={`field ${type === 'number' ? 'font-mono tabular-nums' : ''}`}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="sticky bottom-0 flex justify-end gap-2 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        <button onClick={onSave} className="btn-primary">Save</button>
      </div>
    </div>
  );
}
