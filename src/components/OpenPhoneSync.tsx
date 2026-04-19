'use client';

import { useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes

export default function OpenPhoneSync() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const sync = useCallback(async () => {
    try {
      const settingsRes = await fetch('/api/openphone/settings');
      const settings = await settingsRes.json();
      if (!settings.sync_enabled) return;

      await fetch('/api/openphone/sync', { method: 'POST' });
    } catch {
      // Silent fail — status is tracked in DB
    }
  }, []);

  useEffect(() => {
    // Run initial sync after 10 seconds (let app load first)
    const initial = setTimeout(sync, 10000);
    // Then poll every 15 minutes
    timerRef.current = setInterval(sync, POLL_INTERVAL);

    return () => {
      clearTimeout(initial);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sync]);

  return null; // Invisible component
}
