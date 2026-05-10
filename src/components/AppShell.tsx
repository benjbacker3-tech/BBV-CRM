'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import CommandBar from './CommandBar';
import QuickAddButton from './QuickAddButton';
import OpenPhoneSync from './OpenPhoneSync';

const FULLSCREEN_PATHS = new Set<string>(['/login']);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullscreen = FULLSCREEN_PATHS.has(pathname);

  if (fullscreen) {
    return <main className="h-screen overflow-auto">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandBar />
      <QuickAddButton />
      <OpenPhoneSync />
    </>
  );
}
