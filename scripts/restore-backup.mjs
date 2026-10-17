// Restore a CRM backup (Sandpiper/Backups/CRM/crm-YYYY-MM-DD.json.gz, from src/lib/backup.ts)
// into a database: recreates each table from its saved definition and inserts its rows.
//
//   node scripts/restore-backup.mjs <backup.json.gz> <target .env | file:path.db> [--into-existing]
//
// By default the target must be empty (a fresh Turso database or a new local file), so a
// restore can never overwrite live data by accident. With --into-existing it only adds rows
// that aren't there yet (same primary key), which is safe for recovering deleted records.
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [file, target, flag] = process.argv.slice(2);
if (!file || !target) { console.error('usage: node scripts/restore-backup.mjs <backup.json.gz> <target .env | file:path.db> [--into-existing]'); process.exit(1); }
const readEnv = (path) => Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const t = target.startsWith('file:') ? { TURSO_DATABASE_URL: target } : readEnv(target);
const db = createClient({ url: t.TURSO_DATABASE_URL, authToken: t.TURSO_AUTH_TOKEN });

const backup = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
if (backup.app !== 'sandpiper-crm') throw new Error('Not a Sandpiper CRM backup');
console.log(`Backup from ${backup.at}: ${Object.keys(backup.tables).length} tables`);

const existing = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map(r => String(r.name));
if (existing.length && flag !== '--into-existing') {
  let rows = 0;
  for (const n of existing) rows += Number((await db.execute(`SELECT COUNT(*) AS n FROM "${n}"`)).rows[0].n);
  if (rows > 0) throw new Error(`Target already has ${rows} rows in ${existing.length} tables. Restore into an empty database, or pass --into-existing to add only missing rows.`);
}

// Create every table first (some refer to others), then load rows with foreign-key checks off
// so the load order doesn't matter.
for (const [name, { sql }] of Object.entries(backup.tables)) if (!existing.includes(name)) await db.execute(sql);
await db.execute('PRAGMA foreign_keys = OFF');
for (const [name, { rows }] of Object.entries(backup.tables)) {
  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const res = await db.batch(chunk.map(r => {
      const cols = Object.keys(r);
      return { sql: `INSERT OR IGNORE INTO "${name}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, args: cols.map(c => r[c]) };
    }), 'write');
    added += res.reduce((s, x) => s + x.rowsAffected, 0);
  }
  console.log(`${name.padEnd(26)} ${String(rows.length).padStart(6)} in backup · ${String(added).padStart(6)} restored`);
}
