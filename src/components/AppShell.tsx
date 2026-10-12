'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import CommandBar from './CommandBar';
import QuickAddButton from './QuickAddButton';
import OpenPhoneSync from './OpenPhoneSync';

const FULLSCREEN_PATHS = new Set<string>(['/login']);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  // Share links (/s/<token>) are public pages for vendors: no CRM chrome.
  const fullscreen = FULLSCREEN_PATHS.has(pathname) || pathname.startsWith('/s/');

  if (fullscreen) {
    return <main className="flex-1 min-w-0 h-screen overflow-auto">{children}</main>;
  }

  return (
    <>
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={() => setNavOpen(false)} />}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TopBar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandBar />
      <QuickAddButton />
      <OpenPhoneSync />
    </>
  );
}
