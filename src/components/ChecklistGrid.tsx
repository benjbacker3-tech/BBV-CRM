'use client';

import { DD_STATUSES, DD_STATUS_LABEL, DdItem, DdStatus } from '@/lib/dd-template';
import { daysUntil, ddPill, shortDate } from '@/lib/utils';
import { STATUS_STYLE } from '@/components/deal-tabs/DiligenceTab';

// Shared pieces of the cross-deal checklist grids (Diligence / CM page).
export const colW = 'min-w-[230px] w-[230px]';

export function Section({ title, span, children }: { title: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-y border-slate-200 dark:border-slate-700">
        <td className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-navy dark:text-blue-300">{title}</td>
        <td colSpan={span} className="bg-slate-100 dark:bg-slate-800" />
      </tr>
      {children}
    </>
  );
}

// showLabel: print the line's own label (for cells that stack several lines).
export function GridCell({ item, editing, onEdit, onSave, showLabel = false }: {
  item: DdItem;
  showLabel?: boolean;
  editing: boolean;
  onEdit: (open: boolean) => void;
  onSave: (id: number, patch: Partial<DdItem>) => void;
}) {
  const text = [item.vendor, item.note].filter(Boolean).join(' · ');
  if (!editing) {
    return (
      <button onClick={() => onEdit(true)} className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${item.status === 'na' ? 'opacity-50' : ''}`}>
        {showLabel && <span className="block text-[12px] font-medium leading-snug text-slate-800 dark:text-slate-200 mb-1">{item.label}</span>}
        <span className={STATUS_STYLE[item.status]}>{DD_STATUS_LABEL[item.status]}</span>
        {item.due_date && <span className={`ml-1.5 ${item.status === 'done' ? 'pill pill-muted' : ddPill(daysUntil(item.due_date))}`}>due <span className="font-mono">{shortDate(item.due_date)}</span></span>}
        {text && <span className="block mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400 line-clamp-2 whitespace-pre-line">{text}</span>}
      </button>
    );
  }
  const blur = (field: 'vendor' | 'note') => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value.trim() || null;
    if (v !== (item[field] ?? null)) onSave(item.id, { [field]: v });
  };
  const field = 'field !text-[11px]';
  return (
    <div className="px-2.5 py-2.5 space-y-1.5 bg-slate-50 dark:bg-slate-800/50 ring-1 ring-inset ring-navy/20">
      <div className="flex gap-1">
        {DD_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => onSave(item.id, { status: s as DdStatus })}
            className={item.status === s ? STATUS_STYLE[s] : 'pill pill-muted hover:text-slate-600 cursor-pointer'}
          >
            {DD_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <input autoFocus defaultValue={item.vendor ?? ''} onBlur={blur('vendor')} placeholder="Vendor / who" className={field} />
      <textarea defaultValue={item.note ?? ''} onBlur={blur('note')} rows={2} placeholder="Where it stands" className={`${field} resize-y`} />
      <button onClick={() => onEdit(false)} className="btn-primary !py-0.5 !px-2.5 !text-[11px]">Done</button>
    </div>
  );
}
