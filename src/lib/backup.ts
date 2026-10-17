// Nightly CRM backup: every table dumped to gzipped JSON in OneDrive (Sandpiper/Backups/CRM).
// GitHub only holds the code; this is the copy of the data. Kept: the last 30 days, plus the
// first backup of each month for a year. Older files go to the OneDrive recycle bin.
// Restore with scripts/restore-backup.mjs.
import { gzipSync } from 'node:zlib';
import { all, get, run } from './db';
import { children, deleteItem, ensureFolderPath, uploadBytes } from './graph';

const FOLDER = 'Backups/CRM';
const SKIP = new Set(['auth_failures']);     // short-lived login-attempt log; nothing to restore
const KEEP_DAYS = 30;
const KEEP_MONTHS = 12;

export interface BackupResult { file: string; webUrl: string; tables: number; rows: number; bytes: number; pruned: number; at: string }

export async function dumpDatabase(): Promise<{ json: string; tables: number; rows: number }> {
  const tables = (await all<{ name: string; sql: string }>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' ORDER BY name",
  )).filter(t => !SKIP.has(t.name));
  const out: Record<string, { sql: string; rows: Record<string, unknown>[] }> = {};
  let rows = 0;
  for (const t of tables) {
    const r = await all<Record<string, unknown>>(`SELECT * FROM "${t.name}"`);
    out[t.name] = { sql: t.sql, rows: r };
    rows += r.length;
  }
  return { json: JSON.stringify({ app: 'sandpiper-crm', version: 1, at: new Date().toISOString(), tables: out }), tables: tables.length, rows };
}

const dayOf = (name: string) => name.match(/crm-(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

export async function backupToOneDrive(): Promise<BackupResult> {
  const { json, tables, rows } = await dumpDatabase();
  const gz = gzipSync(Buffer.from(json, 'utf8'));
  const at = new Date();
  const day = at.toISOString().slice(0, 10);
  const folder = await ensureFolderPath(FOLDER);
  const bytes = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer;
  const item = await uploadBytes(folder.id, `crm-${day}.json.gz`, bytes);

  // Prune: keep the last 30 days, and the first backup of each of the last 12 months.
  const files = (await children(folder.id)).filter(f => f.file && dayOf(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const cutoff = new Date(at.getTime() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
  const monthCutoff = new Date(at.getFullYear(), at.getMonth() - KEEP_MONTHS, 1).toISOString().slice(0, 7);
  const firstOfMonth = new Set<string>();
  const seenMonth = new Set<string>();
  for (const f of files) { const m = dayOf(f.name)!.slice(0, 7); if (!seenMonth.has(m)) { seenMonth.add(m); firstOfMonth.add(f.id); } }
  let pruned = 0;
  for (const f of files) {
    const d = dayOf(f.name)!;
    if (d >= cutoff || f.id === item.id) continue;
    if (firstOfMonth.has(f.id) && d.slice(0, 7) >= monthCutoff) continue;
    await deleteItem(f.id);
    pruned++;
  }

  const result: BackupResult = { file: item.name, webUrl: item.webUrl, tables, rows, bytes: gz.byteLength, pruned, at: at.toISOString() };
  await run(`INSERT INTO app_state (key, value, updated_at) VALUES ('backup_last', ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [JSON.stringify(result)]);
  return result;
}

export async function lastBackup(): Promise<BackupResult | null> {
  const r = await get<{ value: string }>("SELECT value FROM app_state WHERE key = 'backup_last'");
  return r ? JSON.parse(r.value) : null;
}
