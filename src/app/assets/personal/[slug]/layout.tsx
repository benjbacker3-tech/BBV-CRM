'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { PERSONAL_SLUGS } from '@/lib/personal';

// Personal properties (Clayton, Emerson): private, outside every Sandpiper total.
export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const base = `/assets/personal/${slug}`;
  const tabs = [
    { href: base, label: 'This Month' },
    { href: `${base}/utilities`, label: 'Utilities' },
    { href: `${base}/reminders`, label: 'Reminders' },
    { href: `${base}/ledger`, label: 'Ledger' },
    slug === 'emerson' ? { href: `${base}/note`, label: "Dan's Note" } : { href: `${base}/ownership`, label: 'Ownership' },
  ];

  if (!(PERSONAL_SLUGS as readonly string[]).includes(slug)) return <div className="page"><p className="page-sub">Not found.</p></div>;

  return (
    <div className="page !max-w-[980px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow"><Link href="/assets" className="hover:text-navy">Assets</Link> · Personal · private</p>
          <div className="flex gap-1">
            {PERSONAL_SLUGS.map(s => (
              <Link
                key={s}
                href={`/assets/personal/${s}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${s === slug ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
        <span className="pill pill-slate" title="Not counted in Sandpiper totals, exports, search or share links">Personal · not in Sandpiper totals</span>
      </div>
      <div className="tabs mb-6 overflow-x-auto">
        {tabs.map(t => (
          <Link key={t.href} href={t.href} className={`tab ${pathname === t.href ? 'tab-active' : ''}`}>{t.label}</Link>
        ))}
      </div>
      {children}
    </div>
  );
}
