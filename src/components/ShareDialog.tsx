'use client';

import { useState } from 'react';

// Create a vendor share link for a OneDrive file or folder (see lib/shares.ts).

export interface ShareTarget { id: string; name: string; isFolder: boolean }

const MODES = [
  { value: 'view', label: 'View & download', hint: 'They can browse and download.' },
  { value: 'upload', label: 'Upload only', hint: 'They can send files in but not see what is there.' },
  { value: 'both', label: 'View, download & upload', hint: 'Two-way: browse, download and add files.' },
] as const;

const EXPIRY = [
  { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 0, label: 'Never' },
];

const genPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
};

export default function ShareDialog({ target, dealId, onClose, onCreated }: { target: ShareTarget; dealId?: number; onClose: () => void; onCreated?: () => void }) {
  const [mode, setMode] = useState<'view' | 'upload' | 'both'>('view');
  const [recipient, setRecipient] = useState('');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(30);
  const [password, setPassword] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: target.id, mode, recipient, recipientEmail: email || null, password: password || null, expiresDays: days, notify, dealId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setError(json.error || 'Could not create the link'); return; }
    setLink(`${window.location.origin}/s/${json.share.token}`);
    onCreated?.();
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailto = () => {
    if (!link) return '#';
    const verb = mode === 'upload' ? 'upload files to' : mode === 'both' ? 'view and upload files in' : 'view';
    const body = `Hi,\n\nHere is a link to ${verb} ${target.name}:\n${link}\n${password ? '\nI will send the password separately.\n' : ''}${days ? `\nThe link is active for ${days} days.\n` : ''}\nThanks,\nBen`;
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Sandpiper Capital: ${target.name}`)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4" onClick={onClose}>
      <div className="card shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="card-header">
          <div className="min-w-0">
            <p className="eyebrow !mb-0.5">Share {target.isFolder ? 'folder' : 'file'}</p>
            <h2 className="card-title truncate" title={target.name}>{target.name}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost !px-2 text-lg leading-none text-slate-400" aria-label="Close">×</button>
        </div>

        {link ? (
          <div className="card-body space-y-3">
            <p className="text-xs text-slate-700 dark:text-slate-300">Link for <span className="font-medium text-slate-900 dark:text-slate-100">{recipient}</span>:</p>
            <div className="flex gap-2">
              <input readOnly value={link} onFocus={e => e.target.select()} className="field flex-1 min-w-0 font-mono !bg-slate-50 dark:!bg-slate-800" />
              <button onClick={copy} className="btn-primary shrink-0">{copied ? 'Copied' : 'Copy'}</button>
            </div>
            {password && (
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                Password: <span className="font-mono font-semibold select-all">{password}</span>. It isn&apos;t shown again, so send it now, separately from the link (text or call).
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <a href={mailto()} className="text-xs text-navy dark:text-blue-300 font-medium hover:underline">Email the link from Outlook</a>
              <button onClick={onClose} className="btn-secondary">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="card-body space-y-4">
            <div>
              <label className="field-label">Who is it for</label>
              <input required autoFocus value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. AEI Consultants (Phase I)" className="field" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Their email (optional)" className="field mt-2" />
            </div>

            <div>
              <label className="field-label">Access</label>
              <div className="space-y-1">
                {MODES.filter(m => target.isFolder || m.value === 'view').map(m => (
                  <label key={m.value} className={`flex items-start gap-2 cursor-pointer rounded-lg border px-2.5 py-2 transition-colors ${mode === m.value ? 'border-navy/40 bg-navy/5 dark:border-blue-800 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                    <input type="radio" name="mode" checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-0.5 accent-navy" />
                    <span className="text-xs leading-snug"><span className="block text-slate-900 dark:text-slate-100 font-medium">{m.label}</span> <span className="text-slate-500 dark:text-slate-400">{m.hint}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Expires after</label>
                <select value={days} onChange={e => setDays(Number(e.target.value))} className="field">
                  {EXPIRY.map(x => <option key={x.days} value={x.days}>{x.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Password (optional)</label>
                <div className="flex gap-1">
                  <input value={password} onChange={e => setPassword(e.target.value)} placeholder="None" className="field flex-1 min-w-0 font-mono" />
                  <button type="button" onClick={() => setPassword(genPassword())} className="btn-secondary !px-2 shrink-0">New</button>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="accent-navy" />
              Email me when they open it or upload files
            </label>

            {error && <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button disabled={busy} className="btn-primary">{busy ? 'Creating…' : 'Create link'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
