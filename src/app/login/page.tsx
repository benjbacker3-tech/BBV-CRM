'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only paths on this site ("/deals"), never "//other.site", "/\other.site" or "javascript:".
  const raw = searchParams.get('next') || '/';
  const next = /^\/(?![\/\\])/.test(raw) ? raw : '/';

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 bg-navy rounded-xl shadow-sm mb-3">
            <span className="text-white font-semibold text-lg">S</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-navy dark:text-blue-200">
            Sandpiper Capital
          </h1>
          <p className="eyebrow mt-1 !mb-0">
            Sandpiper Capital LLC
          </p>
        </div>

        <form onSubmit={submit} className="card p-6">
          <div className="space-y-4">
            <div>
              <label className="field-label">User</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                className="field !text-[13px] !py-2"
                placeholder="ben"
              />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="field !text-[13px] !py-2"
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full !py-2 !text-[13px]"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-6 uppercase tracking-[0.15em]">
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
