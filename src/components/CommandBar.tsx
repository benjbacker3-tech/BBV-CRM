'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fmt } from '@/lib/utils';

interface SearchResults {
  deals: { id: number; name: string; market: string; stage: string; asking_price: number }[];
  contacts: { id: number; name: string; firm: string; type: string; warmth: string; markets: string }[];
  tasks: { id: number; note: string; type: string; due_date: string; done: number; contact_name: string }[];
}

export default function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ deals: [], contacts: [], tasks: [] });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Flatten results for keyboard navigation
  const allItems = [
    ...results.deals.map(d => ({ type: 'deal' as const, id: d.id, label: d.name, sub: `${d.market} · ${d.stage}`, extra: fmt(d.asking_price) })),
    ...results.contacts.map(c => ({ type: 'contact' as const, id: c.id, label: c.name, sub: `${c.firm} · ${c.type}`, extra: c.markets })),
    ...results.tasks.map(t => ({ type: 'task' as const, id: t.id, label: t.note, sub: `${t.contact_name || 'Unassigned'} · ${t.type}`, extra: t.due_date })),
  ];

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults({ deals: [], contacts: [], tasks: [] });
      setSelectedIdx(0);
    }
  }, [open]);

  // Search on query change
  const searchTimeout = useRef<NodeJS.Timeout>();
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ deals: [], contacts: [], tasks: [] });
      return;
    }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
      setSelectedIdx(0);
    }, 150);
  }, [query]);

  const navigate = useCallback((item: typeof allItems[0]) => {
    setOpen(false);
    if (item.type === 'deal') router.push(`/pipeline?deal=${item.id}`);
    else if (item.type === 'contact') router.push(`/contacts?contact=${item.id}`);
    else router.push('/contacts');
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, allItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && allItems[selectedIdx]) { navigate(allItems[selectedIdx]); }
  };

  if (!open) return null;

  const icons: Record<string, string> = { deal: '🏗️', contact: '👤', task: '✓' };
  let globalIdx = -1;

  const renderSection = (title: string, items: typeof allItems, type: string) => {
    const filtered = items.filter(i => i.type === type);
    if (filtered.length === 0) return null;
    return (
      <div key={type}>
        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{title}</div>
        {filtered.map(item => {
          globalIdx++;
          const idx = globalIdx;
          return (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => navigate(item)}
              onMouseEnter={() => setSelectedIdx(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                selectedIdx === idx
                  ? 'bg-amber/10 dark:bg-amber/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="text-base">{icons[item.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.sub}</p>
              </div>
              {item.extra && <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">{item.extra}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#1a1d27] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search deals, contacts, tasks..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[340px] overflow-auto py-1">
          {allItems.length === 0 && query.length >= 2 && (
            <p className="text-sm text-gray-400 text-center py-8">No results for &ldquo;{query}&rdquo;</p>
          )}
          {allItems.length === 0 && query.length < 2 && (
            <p className="text-sm text-gray-400 text-center py-8">Start typing to search...</p>
          )}
          {(() => { globalIdx = -1; return null; })()}
          {renderSection('Deals', allItems, 'deal')}
          {renderSection('Contacts', allItems, 'contact')}
          {renderSection('Tasks', allItems, 'task')}
        </div>
      </div>
    </div>
  );
}
