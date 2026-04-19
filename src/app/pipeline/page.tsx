'use client';

import { useEffect, useState, useCallback } from 'react';
import { Deal, STAGES, Stage, fmt, fmtPct, daysUntil, ddChipColor } from '@/lib/utils';
import DealDetailPanel from '@/components/DealDetailPanel';

const emptyDeal = {
  name: '', address: '', market: '', submarket: '', acreage: 0,
  asking_price: 0, yoc_target: 0, zoning: '', ios_eligible: 1,
  stage: 'Tracking' as Stage, source: '', dd_expiry: '', notes: '',
};

const EMPTY_MESSAGES: Record<string, string> = {
  'Tracking': 'No deals being tracked — add a new deal to get started',
  'LOI Submitted': 'No LOIs out — move a deal here when you submit',
  'PSA Negotiation': 'No PSAs in negotiation — drag a deal over',
  'Under Contract': 'No deals under contract yet',
  'Closed': 'No closed deals — keep pushing!',
  'Dead': 'No dead deals — good sign',
};

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dragDealId, setDragDealId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyDeal);

  const loadDeals = useCallback(() => {
    fetch('/api/deals').then(r => r.json()).then(setDeals);
  }, []);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const addDeal = async () => {
    if (!form.name.trim()) return;
    await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setAdding(false);
    setForm(emptyDeal);
    loadDeals();
  };

  const handleDrop = async (stage: Stage) => {
    if (dragDealId == null) return;
    await fetch(`/api/deals/${dragDealId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    setDragDealId(null);
    loadDeals();
    if (selectedDeal?.id === dragDealId) setSelectedDeal(prev => prev ? { ...prev, stage } : null);
  };

  const togglePin = async (e: React.MouseEvent, deal: Deal) => {
    e.stopPropagation();
    await fetch(`/api/deals/${deal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: deal.pinned ? 0 : 1 }),
    });
    loadDeals();
  };

  // Skeleton loading
  if (deals === null) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="skeleton h-7 w-32" />
          <div className="skeleton h-8 w-28" />
        </div>
        <div className="flex gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="min-w-[240px] w-[240px]">
              <div className="skeleton h-4 w-24 mb-2" />
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 space-y-2 min-h-[200px]">
                {i < 3 && <div className="skeleton h-24 w-full" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 p-6 overflow-auto transition-all ${selectedDeal ? 'mr-[480px]' : ''}`}>
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Pipeline</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">{deals.length} deals</span>
            <button onClick={() => setAdding(!adding)} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">
              {adding ? 'Cancel' : '+ Add Deal'}
            </button>
          </div>
        </div>

        {adding && (
          <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-5 animate-fade-in">
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'name', label: 'Deal Name *', placeholder: 'e.g. Port Houston Yard' },
                { key: 'address', label: 'Address' },
                { key: 'market', label: 'Market', placeholder: 'e.g. Houston' },
                { key: 'submarket', label: 'Submarket' },
                { key: 'acreage', label: 'Acreage', type: 'number', step: '0.1' },
                { key: 'asking_price', label: 'Asking Price', type: 'number', step: '100000' },
                { key: 'yoc_target', label: 'YoC Target (%)', type: 'number', step: '0.1' },
                { key: 'zoning', label: 'Zoning' },
                { key: 'source', label: 'Source', placeholder: 'e.g. CBRE Listing' },
              ].map(({ key, label, type, step, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
                  <input
                    type={type || 'text'} step={step} placeholder={placeholder}
                    value={(form as Record<string, unknown>)[key] as string || ''}
                    onChange={e => setForm({ ...form, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                    className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Stage</label>
                <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value as Stage })}
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber">
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">DD Expiry</label>
                <input type="date" value={form.dd_expiry} onChange={e => setForm({ ...form, dd_expiry: e.target.value })}
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber" />
              </div>
            </div>
            <div className="mt-3">
              <button onClick={addDeal} className="px-4 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Create Deal</button>
            </div>
          </div>
        )}

        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageDeals = deals.filter(d => d.stage === stage).sort((a, b) => (b.pinned || 0) - (a.pinned || 0));
            const pinnedCount = stageDeals.filter(d => d.pinned).length;
            return (
              <div key={stage} className="min-w-[240px] w-[240px] shrink-0"
                onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(stage)}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{stage}</h3>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-mono">{stageDeals.length}</span>
                </div>
                <div className="space-y-2 min-h-[100px] bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                  {stageDeals.map((deal, idx) => {
                    const days = deal.stage === 'Under Contract' ? daysUntil(deal.dd_expiry) : null;
                    const showDivider = pinnedCount > 0 && idx === pinnedCount;
                    return (
                      <div key={deal.id}>
                        {showDivider && <div className="border-t border-dashed border-gray-300 dark:border-gray-600 my-2" />}
                        <div
                          draggable onDragStart={() => setDragDealId(deal.id)}
                          onClick={() => setSelectedDeal(deal)}
                          className={`kanban-card animate-fade-in bg-white dark:bg-surface rounded-lg p-3 border cursor-pointer relative group ${
                            selectedDeal?.id === deal.id ? 'border-amber ring-1 ring-amber/30' : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {/* Pin button */}
                          <button onClick={e => togglePin(e, deal)} title={deal.pinned ? 'Unpin deal' : 'Pin deal'}
                            className={`absolute top-2 right-2 transition-opacity ${deal.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <svg className={`w-3.5 h-3.5 ${deal.pinned ? 'text-amber fill-amber' : 'text-gray-300 dark:text-gray-500'}`}
                              viewBox="0 0 24 24" fill={deal.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1 pr-5">{deal.name}</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{deal.market}</p>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{fmt(deal.asking_price)}</span>
                            <span className="font-mono text-xs text-amber-dark dark:text-amber-light">{fmtPct(deal.yoc_target)} YoC</span>
                          </div>
                          {days != null && (
                            <div className={`mt-2 text-xs px-2 py-0.5 rounded-full font-mono text-center ${ddChipColor(days)}`}>
                              DD: {days}d remaining
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6 px-2">{EMPTY_MESSAGES[stage]}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDeal && (
        <DealDetailPanel deal={selectedDeal} onClose={() => setSelectedDeal(null)}
          onUpdate={updated => { setSelectedDeal(updated); loadDeals(); }} />
      )}
    </div>
  );
}
