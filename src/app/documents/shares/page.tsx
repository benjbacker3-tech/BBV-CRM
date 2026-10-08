'use client';

import Link from 'next/link';
import SharedLinks from '@/components/SharedLinks';

export default function SharesPage() {
  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="flex items-end justify-between mb-5 pb-4 border-b border-gray-200">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1"><Link href="/documents" className="hover:underline">Documents</Link> · Sharing</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">Shared links</h1>
        </div>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed mb-5 max-w-3xl">
        Links you&apos;ve sent to vendors and consultants. Create one with <span className="font-medium">Share</span> next to any folder or file in Documents or a deal&apos;s Documents tab.
        Links open a Sandpiper page (no Microsoft login for them); you can see every open, download and upload, and revoke a link at any time.
        Activity is shown as opens / downloads / uploads; click it for the full log.
      </p>
      <SharedLinks />
    </div>
  );
}
