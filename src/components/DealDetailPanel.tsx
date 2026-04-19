'use client';

import { useState } from 'react';
import { Deal, fmt } from '@/lib/utils';
import OverviewTab from './deal-tabs/OverviewTab';
import ContactsTab from './deal-tabs/ContactsTab';
import DiligenceTab from './deal-tabs/DiligenceTab';
import LOITab from './deal-tabs/LOITab';
import NapkinMathTab from './deal-tabs/NapkinMathTab';

interface Props {
  deal: Deal;
  onClose: () => void;
  onUpdate: (deal: Deal) => void;
  onDelete?: () => void;
}

const TABS = ['Overview', 'Contacts', 'Diligence', 'LOI', 'Napkin Math'] as const;
type Tab = (typeof TABS)[number];

export default function DealDetailPanel({ deal, onClose, onUpdate, onDelete }: Props) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    await fetch(`/api/deals/${deal.id}`, { method: 'DELETE' });
    if (onDelete) onDelete();
    onClose();
  };

  return (
    <div className="fixed right-0 top-0 h-screen w-[480px] bg-white dark:bg-surface border-l border-gray-200 dark:border-gray-700 shadow-xl flex flex-col z-50">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{deal.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{deal.address}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full font-medium">{deal.stage}</span>
            <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{fmt(deal.asking_price)}</span>
            <span className="font-mono text-xs text-amber">{deal.yoc_target ? `${((deal.yoc_target) * 100).toFixed(1)}%` : '—'} YoC</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete deal"
            className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M11 7V4a2 2 0 114 0v3" />
            </svg>
          </button>
          <button onClick={onClose} title="Close" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-100 dark:border-gray-700 px-5 shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-amber text-amber'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-5">
        {tab === 'Overview' && <OverviewTab deal={deal} onUpdate={onUpdate} />}
        {tab === 'Contacts' && <ContactsTab dealId={deal.id} />}
        {tab === 'Diligence' && <DiligenceTab deal={deal} />}
        {tab === 'LOI' && <LOITab deal={deal} />}
        {tab === 'Napkin Math' && <NapkinMathTab deal={deal} />}
      </div>

      {/* Confirm delete overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white dark:bg-surface rounded-lg shadow-xl p-5 w-[360px] max-w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Delete &ldquo;{deal.name}&rdquo;?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              This will permanently remove the deal and its associated contacts, tasks, and diligence. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
