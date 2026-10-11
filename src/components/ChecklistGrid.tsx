'use client';

import { DD_STATUSES, DD_STATUS_LABEL, DdItem, DdStatus } from '@/lib/dd-template';
import { STATUS_STYLE } from '@/components/deal-tabs/DiligenceTab';

// Shared pieces of the cross-deal checklist grids (Diligence / CM page).
export const colW = 'min-w-[220px] w-[220px]';

export function Section({ title, span, children }: { title: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-navy/5 border-b border-gray-200">
        <td className="sticky left-0 z-10 bg-[#EEF1F5] px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-navy">{title}</td>
        <td colSpan={span} className="bg-[#EEF1F5]" />
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
      <button onClick={() => onEdit(true)} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${item.status === 'na' ? 'opacity-50' : ''}`}>
        {showLabel && <span className="block text-[11px] font-medium text-gray-800 mb-0.5">{item.label}</span>}
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[item.status]}`}>{DD_STATUS_LABEL[item.status]}</span>
        {item.due_date && <span className="ml-1.5 font-mono text-[10px] text-gray-400">due {item.due_date}</span>}
        {text && <span className="block mt-0.5 text-[11px] text-gray-600 line-clamp-2 whitespace-pre-line">{text}</span>}
      </button>
    );
  }
  const blur = (field: 'vendor' | 'note') => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value.trim() || null;
    if (v !== (item[field] ?? null)) onSave(item.id, { [field]: v });
  };
  const field = 'text-[11px] border border-gray-200 rounded px-1.5 py-1 w-full focus:outline-none focus:ring-1 focus:ring-navy';
  return (
    <div className="px-2 py-2 space-y-1 bg-gray-50">
      <div className="flex gap-1">
        {DD_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => onSave(item.id, { status: s as DdStatus })}
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.status === s ? STATUS_STYLE[s] + ' ring-1 ring-navy/40' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            {DD_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <input autoFocus defaultValue={item.vendor ?? ''} onBlur={blur('vendor')} placeholder="Vendor / who" className={field} />
      <textarea defaultValue={item.note ?? ''} onBlur={blur('note')} rows={2} placeholder="Where it stands" className={`${field} resize-y`} />
      <button onClick={() => onEdit(false)} className="text-[10px] text-navy font-medium">Done</button>
    </div>
  );
}
