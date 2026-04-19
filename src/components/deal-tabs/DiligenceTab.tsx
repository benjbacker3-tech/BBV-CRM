'use client';

import { useEffect, useState } from 'react';
import { Deal } from '@/lib/utils';

interface DiligenceCategory {
  id: number;
  deal_id: number;
  category: string;
  vendor: string;
  due_date: string;
}

interface DiligenceItem {
  id: number;
  diligence_id: number;
  label: string;
  status: 'pending' | 'in-progress' | 'complete';
}

const CATEGORY_LABELS: Record<string, string> = {
  site: 'Site Visit',
  env: 'Environmental',
  pca: 'PCA',
  survey: 'Survey',
  roof: 'Roof',
  contractor: 'Contractor',
  zoning: 'Zoning',
};

export default function DiligenceTab({ deal }: { deal: Deal }) {
  const [categories, setCategories] = useState<DiligenceCategory[]>([]);
  const [items, setItems] = useState<DiligenceItem[]>([]);

  const load = () => {
    fetch(`/api/diligence?deal_id=${deal.id}`).then(r => r.json()).then(data => {
      setCategories(data.diligence || []);
      setItems(data.items || []);
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [deal.id]);

  if (deal.stage !== 'Under Contract') {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-400 dark:text-gray-500">Diligence tracking is available for Under Contract deals only.</p>
      </div>
    );
  }

  const totalItems = items.length;
  const completeItems = items.filter(i => i.status === 'complete').length;
  const progress = totalItems > 0 ? Math.round((completeItems / totalItems) * 100) : 0;

  const updateItemStatus = async (itemId: number, status: string) => {
    await fetch(`/api/diligence-items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const updateVendor = async (catId: number, vendor: string) => {
    await fetch(`/api/diligence/${catId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor }),
    });
  };

  const statusColors = {
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    'in-progress': 'bg-blue-100 text-blue-700',
    complete: 'bg-green-100 text-green-700',
  };

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Progress</span>
          <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{progress}%</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{completeItems} of {totalItems} items complete</p>
      </div>

      {/* Categories */}
      <div className="space-y-4">
        {categories.map(cat => {
          const catItems = items.filter(i => i.diligence_id === cat.id);
          return (
            <div key={cat.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{CATEGORY_LABELS[cat.category] || cat.category}</h4>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{cat.due_date}</span>
              </div>
              <div className="mb-2">
                <input
                  type="text"
                  defaultValue={cat.vendor}
                  onBlur={(e) => updateVendor(cat.id, e.target.value)}
                  placeholder="Vendor"
                  className="text-xs border border-gray-100 dark:border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
                />
              </div>
              <div className="space-y-1.5">
                {catItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-300">{item.label}</span>
                    <select
                      value={item.status}
                      onChange={(e) => updateItemStatus(item.id, e.target.value)}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer ${statusColors[item.status]}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
