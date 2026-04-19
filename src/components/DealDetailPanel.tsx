'use client';

import { useState } from 'react';
import { Deal, fmt, fmtPct } from '@/lib/utils';
import OverviewTab from './deal-tabs/OverviewTab';
import ContactsTab from './deal-tabs/ContactsTab';
import DiligenceTab from './deal-tabs/DiligenceTab';
import LOITab from './deal-tabs/LOITab';
import NapkinMathTab from './deal-tabs/NapkinMathTab';

interface Props {
  deal: Deal;
  onClose: () => void;
  onUpdate: (deal: Deal) => void;
}

const TABS = ['Overview', 'Contacts', 'Diligence', 'LOI', 'Napkin Math'] as const;
type Tab = (typeof TABS)[number];

export default function DealDetailPanel({ deal, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('Overview');

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
            <span className="font-mono text-xs text-amber">{fmtPct(deal.yoc_target)} YoC</span>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
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
    </div>
  );
}
