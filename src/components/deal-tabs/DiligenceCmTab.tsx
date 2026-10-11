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
      <div className="segmented w-full mb-4">
        {([['dd', 'Diligence'], ['cm', 'Construction']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`segment flex-1 !py-1.5 ${view === v ? 'segment-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'dd' ? <DiligenceTab deal={deal} /> : <ConstructionTab deal={deal} />}
    </div>
  );
}
