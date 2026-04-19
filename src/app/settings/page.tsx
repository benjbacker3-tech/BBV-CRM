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

  if (!settings) return <div className="p-6"><div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

      {/* OpenPhone Integration */}
      <div className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">OpenPhone Integration</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Auto-sync calls and messages to contact log</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Sync Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Auto-sync enabled</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Poll OpenPhone every 15 minutes</p>
            </div>
            <button
              onClick={() => updateSetting('sync_enabled', settings.sync_enabled ? 0 : 1)}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.sync_enabled ? 'bg-amber' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.sync_enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Track Personal */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Track personal calls/messages</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Log activity to/from your personal number</p>
            </div>
            <button
              onClick={() => updateSetting('track_personal', settings.track_personal ? 0 : 1)}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.track_personal ? 'bg-amber' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.track_personal ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Personal Number */}
          <div>
            <label className="text-sm text-gray-700 dark:text-gray-300 block mb-1">Personal number</label>
            <input
              type="text"
              value={settings.personal_number}
              onChange={e => setSettings({ ...settings, personal_number: e.target.value })}
              onBlur={e => updateSetting('personal_number', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-100"
            />
          </div>

          {/* Sync Status */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    !syncStatus?.last_sync_at ? 'bg-gray-300 dark:bg-gray-600' :
                    syncStatus.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {!syncStatus?.last_sync_at ? 'Never synced' :
                     syncStatus.status === 'ok' ? 'Last sync successful' : 'Last sync failed'}
                  </span>
                </div>
                {syncStatus?.last_sync_at && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 ml-3.5">
                    {new Date(syncStatus.last_sync_at).toLocaleString()}
                    {syncStatus.status === 'ok' && ` — ${syncStatus.calls_synced} calls, ${syncStatus.messages_synced} messages`}
                  </p>
                )}
                {syncStatus?.error_message && (
                  <p className="text-xs text-red-500 mt-0.5 ml-3.5">{syncStatus.error_message}</p>
                )}
              </div>
              <button
                onClick={syncNow}
                disabled={syncing}
                className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Info */}
      <div className="bg-gray-50 dark:bg-surface-dark rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Configuration</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Set your OpenPhone API key and number ID in <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-[11px]">.env.local</code>:
        </p>
        <pre className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded p-2 font-mono">
{`OPENPHONE_API_KEY=your_key_here
OPENPHONE_NUMBER_ID=PNxxxxxx`}
        </pre>
      </div>
    </div>
  );
}
