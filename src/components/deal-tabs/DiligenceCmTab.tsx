'use client';

import { useState } from 'react';
import { Deal } from '@/lib/utils';
import DiligenceTab from './DiligenceTab';
import ConstructionTab from './ConstructionTab';

// "Diligence / CM" deal tab: the diligence checklist and the construction (CM)
// checklist side by side. Closed deals open on construction.
export default function DiligenceCmTab({ deal }: { deal: Deal }) {
  const [view, setView] = useState<'dd' | 'cm'>(deal.stage === 'Closed' ? 'cm' : 'dd');

  return (
    <div>
      <div className="flex border-b border-gray-100 dark:border-gray-700 mb-4 -mt-1">
        {([['dd', 'Diligence'], ['cm', 'Construction']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              view === v
                ? 'border-navy text-navy dark:border-blue-300 dark:text-blue-300'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'dd' ? <DiligenceTab deal={deal} /> : <ConstructionTab deal={deal} />}
    </div>
  );
}
