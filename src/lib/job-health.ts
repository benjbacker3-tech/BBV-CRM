// Health of the CRM's automatic jobs, for the Settings page: when each last ran, whether it
// worked, and the error if not. Each cron records its outcome under app_state `job:<name>`.
import { all, run } from './db';
import brief from '../../data/rates-brief.json';

export type JobName = 'mail-filing' | 'leads' | 'backup';
export interface JobRun { at: string; ok: boolean; detail?: string }
export interface JobHealth { name: string; label: string; schedule: string; last: JobRun | null; lastOk: string | null; stale: boolean; note?: string }

// Run a job and record how it went. Returns the job's result, or rethrows its error.
export async function recordJob<T>(name: JobName, fn: () => Promise<T>, summarize?: (r: T) => string): Promise<T> {
  try {
    const r = await fn();
    await save(name, { at: new Date().toISOString(), ok: true, detail: summarize?.(r) });
    return r;
  } catch (e) {
    await save(name, { at: new Date().toISOString(), ok: false, detail: e instanceof Error ? e.message : String(e) }).catch(() => {});
    throw e;
  }
}

async function save(name: JobName, r: JobRun) {
  await run(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [`job:${name}`, JSON.stringify(r)]);
  if (r.ok) await run(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [`job_ok:${name}`, r.at]);
}

const HOURS = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity);

export async function jobHealth(): Promise<JobHealth[]> {
  const rows = Object.fromEntries((await all<{ key: string; value: string }>(
    "SELECT key, value FROM app_state WHERE key LIKE 'job:%' OR key LIKE 'job_ok:%' OR key IN ('mail_filing_last_run', 'leads_last_run', 'backup_last')",
  )).map(r => [String(r.key), String(r.value)]));
  const parse = (k: string) => { try { return rows[k] ? JSON.parse(rows[k]) : null; } catch { return null; } };
  // A manual run (Check email now, Back up now) also counts as a success.
  const lastOk = (name: JobName, legacy: string) => {
    const a = rows[`job_ok:${name}`] || null;
    const b = parse(legacy)?.at || null;
    return [a, b].filter(Boolean).sort().pop() || null;
  };
  const job = (name: JobName, label: string, schedule: string, legacy: string): JobHealth => {
    const last = parse(`job:${name}`) as JobRun | null;
    const ok = lastOk(name, legacy);
    return { name, label, schedule, last, lastOk: ok, stale: HOURS(ok) > 36 };
  };

  // The Daily Brief: the dateline of the file the site was built from.
  const m = String((brief as { dateline?: string }).dateline || '').match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
  const briefDate = m ? new Date(m[1] + ' 12:00') : null;
  const businessDaysOld = briefDate ? businessDaysSince(briefDate) : Infinity;
  const briefJob: JobHealth = {
    name: 'brief', label: 'Daily Brief', schedule: 'weekdays, ready by 6:45am MT',
    last: briefDate ? { at: briefDate.toISOString(), ok: businessDaysOld <= 1, detail: (brief as { dateline?: string }).dateline } : null,
    lastOk: briefDate ? briefDate.toISOString() : null, stale: businessDaysOld > 1,
    note: 'Date of the brief this deploy shows',
  };

  return [
    briefJob,
    job('mail-filing', 'Email filing', 'daily, 7am MT', 'mail_filing_last_run'),
    job('leads', 'Broker leads', 'daily, 7:15am MT', 'leads_last_run'),
    job('backup', 'Database backup', 'daily, 3am MT', 'backup_last'),
  ];
}

function businessDaysSince(d: Date): number {
  const t = new Date(); t.setHours(12, 0, 0, 0);
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  let n = 0;
  while (x < t) { x.setDate(x.getDate() + 1); if (x.getDay() !== 0 && x.getDay() !== 6) n++; }
  return n;
}
