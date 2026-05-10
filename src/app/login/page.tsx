'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Sign in failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surface-dark px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-navy rounded-lg mb-3">
            <span className="text-amber font-bold text-lg">M</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
            <span className="text-amber">MCI</span> CRM
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-[0.15em]">
            Mission Critical Industrial
          </p>
        </div>

        <form onSubmit={submit} className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5 uppercase tracking-wide">User</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-100"
                placeholder="eric / ben / anthony"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5 uppercase tracking-wide">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-100"
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-amber text-white text-sm font-medium rounded hover:bg-amber-dark disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 mt-6 uppercase tracking-[0.15em]">
          Confidential · Authorized users only
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
