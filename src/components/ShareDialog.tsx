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
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400">Share {target.isFolder ? 'folder' : 'file'}</p>
            <h2 className="text-sm font-medium text-gray-900 truncate" title={target.name}>{target.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1">×</button>
        </div>

        {link ? (
          <div className="p-5 space-y-3">
            <p className="text-xs text-gray-700">Link for <span className="font-medium">{recipient}</span>:</p>
            <div className="flex gap-2">
              <input readOnly value={link} onFocus={e => e.target.select()} className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono text-gray-800 bg-gray-50" />
              <button onClick={copy} className="px-3 py-1.5 text-xs text-white bg-navy rounded hover:bg-navy-light">{copied ? 'Copied' : 'Copy'}</button>
            </div>
            {password && (
              <p className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Password: <span className="font-mono font-semibold select-all">{password}</span>. It isn&apos;t shown again, so send it now, separately from the link (text or call).
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <a href={mailto()} className="text-xs text-navy font-medium hover:underline">Email the link from Outlook</a>
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="p-5 space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Who is it for</label>
              <input required autoFocus value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. AEI Consultants (Phase I)" className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm text-gray-900" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Their email (optional)" className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm text-gray-900 mt-2" />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Access</label>
              <div className="space-y-1.5">
                {MODES.filter(m => target.isFolder || m.value === 'view').map(m => (
                  <label key={m.value} className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="mode" checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-0.5" />
                    <span className="text-xs"><span className="text-gray-900 font-medium">{m.label}</span> <span className="text-gray-500">{m.hint}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Expires after</label>
                <select value={days} onChange={e => setDays(Number(e.target.value))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 bg-white">
                  {EXPIRY.map(x => <option key={x.days} value={x.days}>{x.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Password (optional)</label>
                <div className="flex gap-1">
                  <input value={password} onChange={e => setPassword(e.target.value)} placeholder="None" className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono text-gray-900" />
                  <button type="button" onClick={() => setPassword(genPassword())} className="px-2 text-[11px] text-navy border border-gray-300 rounded hover:bg-gray-50">New</button>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
              Email me when they open it or upload files
            </label>

            {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button disabled={busy} className="px-4 py-1.5 text-xs text-white bg-navy rounded hover:bg-navy-light disabled:opacity-50">{busy ? 'Creating…' : 'Create link'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
