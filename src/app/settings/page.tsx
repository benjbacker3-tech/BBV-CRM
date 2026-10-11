'use client';

import { useEffect, useState } from 'react';

interface Settings {
  sync_enabled: number;
  track_personal: number;
  personal_number: string;
}

interface SyncStatus {
  last_sync_at: string | null;
  status: string;
  error_message: string | null;
  calls_synced: number;
  messages_synced: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch('/api/openphone/settings').then(r => r.json()).then(setSettings);
    fetch('/api/openphone/sync').then(r => r.json()).then(setSyncStatus);
  }, []);

  const updateSetting = async (key: string, value: number | string) => {
    const res = await fetch('/api/openphone/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    setSettings(await res.json());
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await fetch('/api/openphone/sync', { method: 'POST' });
      const res = await fetch('/api/openphone/sync');
      setSyncStatus(await res.json());
    } finally {
      setSyncing(false);
    }
  };

  if (!settings) return <div className="page"><div className="h-8 w-48 skeleton" /></div>;

  return (
    <div className="page max-w-3xl">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sandpiper Capital LLC · Workspace</p>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      {/* OpenPhone Integration */}
      <div className="card mb-6">
        <div className="card-header justify-start">
          <div className="w-8 h-8 bg-navy/5 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-navy dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <h2 className="card-title">OpenPhone Integration</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Auto-sync calls and messages to contact log</p>
          </div>
        </div>

        <div className="card-body space-y-4">
          {/* Sync Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-slate-800 dark:text-slate-200">Auto-sync enabled</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Poll OpenPhone every 15 minutes</p>
            </div>
            <button
              onClick={() => updateSetting('sync_enabled', settings.sync_enabled ? 0 : 1)}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.sync_enabled ? 'bg-navy dark:bg-blue-400' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings.sync_enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Track Personal */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-slate-800 dark:text-slate-200">Track personal calls/messages</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Log activity to/from your personal number</p>
            </div>
            <button
              onClick={() => updateSetting('track_personal', settings.track_personal ? 0 : 1)}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.track_personal ? 'bg-navy dark:bg-blue-400' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings.track_personal ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Personal Number */}
          <div>
            <label className="field-label">Personal number</label>
            <input
              type="text"
              value={settings.personal_number}
              onChange={e => setSettings({ ...settings, personal_number: e.target.value })}
              onBlur={e => updateSetting('personal_number', e.target.value)}
              className="field font-mono"
            />
          </div>

          {/* Sync Status */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className={`pill ${
                  !syncStatus?.last_sync_at ? 'pill-slate' :
                  syncStatus.status === 'ok' ? 'pill-green' : 'pill-red'
                }`}>
                  {!syncStatus?.last_sync_at ? 'Never synced' :
                   syncStatus.status === 'ok' ? 'Last sync successful' : 'Last sync failed'}
                </span>
                {syncStatus?.last_sync_at && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className="font-mono tabular-nums">{new Date(syncStatus.last_sync_at).toLocaleString()}</span>
                    {syncStatus.status === 'ok' && ` — ${syncStatus.calls_synced} calls, ${syncStatus.messages_synced} messages`}
                  </p>
                )}
                {syncStatus?.error_message && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{syncStatus.error_message}</p>
                )}
              </div>
              <button
                onClick={syncNow}
                disabled={syncing}
                className="btn-primary"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Info */}
      <div className="card card-body">
        <h3 className="section-label mb-2">Configuration</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Set your OpenPhone API key and number ID in <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px] font-mono">.env.local</code>:
        </p>
        <pre className="mt-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-mono">
{`OPENPHONE_API_KEY=your_key_here
OPENPHONE_NUMBER_ID=PNxxxxxx`}
        </pre>
      </div>
    </div>
  );
}
