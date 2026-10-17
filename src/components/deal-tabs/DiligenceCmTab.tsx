'use client';

import { useState } from 'react';
import { Deal } from '@/lib/utils';
import DiligenceTab from './DiligenceTab';
import ConstructionTab from './ConstructionTab';
import ContractDates from './ContractDates';

// "Diligence / CM" deal tab: the diligence checklist and the construction (CM)
// checklist side by side, under the PSA's contract dates. Closed deals open on construction.
export default function DiligenceCmTab({ deal, onUpdate }: { deal: Deal; onUpdate?: (d: Deal) => void }) {
  const [view, setView] = useState<'dd' | 'cm'>(deal.stage === 'Closed' ? 'cm' : 'dd');
  // Saving contract dates re-dates the checklist; remount it so it shows the new due dates.
  const [rev, setRev] = useState(0);

  return (
    <div>
      {deal.stage !== 'Closed' && <ContractDates deal={deal} onSaved={d => { onUpdate?.(d); setRev(r => r + 1); }} />}
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
      {view === 'dd' ? <DiligenceTab key={rev} deal={deal} /> : <ConstructionTab deal={deal} />}
    </div>
  );
}
