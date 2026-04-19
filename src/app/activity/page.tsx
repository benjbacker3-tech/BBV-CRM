'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityEntry, timeAgo } from '@/lib/utils';

const ACTION_ICONS: Record<string, string> = {
  created: '🆕', stage_changed: '📋', pinned: '⭐', unpinned: '☆',
  note_edited: '📝', completed: '✅', logged: '📞', status_changed: '🔄',
  loi_generated: '📄',
};

const ENTITY_COLORS: Record<string, string> = {
  deal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  contact: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  task: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  diligence: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  investor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const pollRef = useRef<NodeJS.Timeout>();

  const load = useCallback(async () => {
    const params = filter !== 'all' ? `?entity_type=${filter}` : '';
    const res = await fetch(`/api/activity${params}`);
    const data = await res.json();
    setEntries(data.entries || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Poll every 30 seconds
  useEffect(() => {
    pollRef.current = setInterval(load, 30000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const filters = ['all', 'deal', 'contact', 'task', 'diligence'];

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Activity</h1>
        <div className="flex border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs capitalize ${filter === f ? 'bg-navy text-white dark:bg-amber dark:text-white' : 'bg-white dark:bg-surface text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-3 p-3">
              <div className="skeleton w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">No activity yet. Actions across deals, contacts, and tasks will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors animate-fade-in">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm shrink-0">
                {ACTION_ICONS[entry.action] || '📌'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ENTITY_COLORS[entry.entity_type] || 'bg-gray-100 text-gray-600'}`}>
                    {entry.entity_type}
                  </span>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{entry.description}</p>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5" title={entry.created_at}>{timeAgo(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
