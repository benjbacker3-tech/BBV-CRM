import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shared files · Sandpiper Capital LLC',
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
