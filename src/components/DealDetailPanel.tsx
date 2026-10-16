'use client';

import { useState } from 'react';
import { Deal, fmt, googleEarthUrl } from '@/lib/utils';
import OverviewTab from './deal-tabs/OverviewTab';
import ContactsTab from './deal-tabs/ContactsTab';
import DiligenceCmTab from './deal-tabs/DiligenceCmTab';
import LOITab from './deal-tabs/LOITab';
import NapkinMathTab from './deal-tabs/NapkinMathTab';
import DocumentsTab from './deal-tabs/DocumentsTab';

interface Props {
  deal: Deal;
  onClose: () => void;
  onUpdate: (deal: Deal) => void;
  onDelete?: () => void;
  initialTab?: Tab;
}

const TABS = ['Overview', 'Documents', 'Contacts', 'Diligence / CM', 'LOI', 'Napkin Math'] as const;
export type Tab = (typeof TABS)[number];

export default function DealDetailPanel({ deal, onClose, onUpdate, onDelete, initialTab = 'Overview' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const earthUrl = googleEarthUrl(deal);

  const handleDelete = async () => {
    await fetch(`/api/deals/${deal.id}`, { method: 'DELETE' });
    if (onDelete) onDelete();
    onClose();
  };

  return (
    <div className="fixed right-0 top-0 h-screen w-[480px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl shadow-slate-900/10 flex flex-col z-50">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0">
        <div>
          <p className="eyebrow">{[deal.city, deal.market && deal.market !== deal.city ? deal.market : null].filter(Boolean).join(' · ') || 'Deal'}</p>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">{deal.name}</h2>
          {deal.address && deal.address !== deal.name && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{deal.address}</p>}
          <div className="flex items-center gap-2 mt-2.5">
            <span className="pill pill-navy">{deal.stage}</span>
            <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{fmt(deal.asking_price)}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{deal.yoc_target ? `${((deal.yoc_target) * 100).toFixed(1)}%` : '—'} YoC</span>
            {earthUrl && (
              <a href={earthUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-2 !py-0.5 !text-[11px] ml-1" title="Open this address in Google Earth">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9z" />
                </svg>
                Google Earth
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete deal"
            className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M11 7V4a2 2 0 114 0v3" />
            </svg>
          </button>
          <button onClick={onClose} title="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tabs px-3 shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tab !px-2.5 !text-xs ${tab === t ? 'tab-active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-5 bg-slate-50/50 dark:bg-slate-900">
        {tab === 'Overview' && <OverviewTab deal={deal} onUpdate={onUpdate} />}
        {tab === 'Documents' && <DocumentsTab deal={deal} onUpdate={onUpdate} />}
        {tab === 'Contacts' && <ContactsTab dealId={deal.id} />}
        {tab === 'Diligence / CM' && <DiligenceCmTab deal={deal} />}
        {tab === 'LOI' && <LOITab deal={deal} />}
        {tab === 'Napkin Math' && <NapkinMathTab deal={deal} onUpdate={onUpdate} />}
      </div>

      {/* Confirm delete overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center z-10" onClick={() => setConfirmDelete(false)}>
          <div className="card shadow-xl p-5 w-[360px] max-w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete &ldquo;{deal.name}&rdquo;?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              This will permanently remove the deal and its associated contacts, tasks, and diligence. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleDelete} className="btn bg-red-600 text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
