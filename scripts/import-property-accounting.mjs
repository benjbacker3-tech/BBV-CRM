// One-time copy of the old property-accounting app's data (Clayton, Emerson) into the CRM's
// personal_* tables (see src/lib/personal.ts). Read-only on the source; on the target it only
// inserts, skipping rows already copied (same id), so it is safe to run again.
//
//   node scripts/import-property-accounting.mjs <source .env> [target .env | file:path.db]
//
// The source .env is the old app's (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). The target
// defaults to this repo's .env.local (the live CRM database). It creates the personal_* tables
// if needed, with the same definitions the CRM uses (src/lib/db.ts).
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';

const readEnv = (path) => Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));

const [srcPath, targetArg = '.env.local'] = process.argv.slice(2);
if (!srcPath) { console.error('usage: node scripts/import-property-accounting.mjs <source .env> [target .env | file:path.db]'); process.exit(1); }
const s = readEnv(srcPath);
const src = createClient({ url: s.TURSO_DATABASE_URL, authToken: s.TURSO_AUTH_TOKEN });
const t = targetArg.startsWith('file:') ? { TURSO_DATABASE_URL: targetArg } : readEnv(targetArg);
const dst = createClient({ url: t.TURSO_DATABASE_URL, authToken: t.TURSO_AUTH_TOKEN });

// [source table, target table]; column names are the same on both sides.
const TABLES = [
  ['properties', 'personal_properties'],
  ['utility_bills', 'personal_utility_bills'],
  ['monthly_checkins', 'personal_checkins'],
  ['reminders', 'personal_reminders'],
  ['transactions', 'personal_transactions'],
  ['dan_payments', 'personal_note_payments'],
];

// Create the personal_* tables if the CRM hasn't yet, using the exact DDL in src/lib/db.ts.
const dbTs = readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8');
const ddl = dbTs.match(/CREATE TABLE IF NOT EXISTS personal_properties[\s\S]*?CREATE TABLE IF NOT EXISTS personal_note_payments \([\s\S]*?\);/);
if (!ddl) throw new Error('Could not find the personal_* table definitions in src/lib/db.ts');
await dst.executeMultiple(ddl[0]);

for (const [from, to] of TABLES) {
  const targetCols = (await dst.execute(`SELECT name FROM pragma_table_info('${to}')`)).rows.map(r => String(r.name));
  if (!targetCols.length) throw new Error(`${to} is missing on the target`);
  const rows = (await src.execute(`SELECT * FROM ${from}`)).rows;
  let added = 0;
  for (const row of rows) {
    const cols = Object.keys(row).filter(c => targetCols.includes(c));
    const res = await dst.execute({
      sql: `INSERT OR IGNORE INTO ${to} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      args: cols.map(c => row[c] ?? null),
    });
    added += res.rowsAffected;
  }
  const total = Number((await dst.execute(`SELECT COUNT(*) AS n FROM ${to}`)).rows[0].n);
  console.log(`${from.padEnd(17)} ${String(rows.length).padStart(4)} in source · ${String(added).padStart(4)} copied · ${String(total).padStart(4)} now in ${to}`);
}
