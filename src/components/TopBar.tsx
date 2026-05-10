'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeProvider';

export default function TopBar() {
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; displayName: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user || null));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

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

        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="w-6 h-6 bg-amber rounded-full flex items-center justify-center text-white text-[10px] font-semibold">
                {user.displayName.charAt(0)}
              </span>
              <span className="hidden sm:inline">{user.displayName}</span>
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.displayName}</p>
                </div>
                <button
                  onClick={signOut}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
