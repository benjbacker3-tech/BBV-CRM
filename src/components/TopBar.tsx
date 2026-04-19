'use client';

import { ThemeToggle } from './ThemeProvider';

export default function TopBar() {
  return (
    <header className="flex items-center justify-end px-6 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-surface-dark">
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          title="Search (Ctrl+K)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search
          <kbd className="text-[10px] px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono ml-2">⌘K</kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
