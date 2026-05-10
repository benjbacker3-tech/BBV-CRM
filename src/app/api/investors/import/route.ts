import { NextRequest, NextResponse } from 'next/server';
import { run, all, batch } from '@/lib/db';
import { parseCSV, indexHeaders, pick } from '@/lib/csv';

export const maxDuration = 60;

// POST /api/investors/import
//   file:  CSV (required)
//   mode:  'replace' to wipe existing investors, else 'append' (default)
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  const mode = (form.get('mode') as string) || 'append';

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCSV(text);

  if (mode === 'replace') {
    await run('DELETE FROM investors');
    await run("DELETE FROM sqlite_sequence WHERE name = 'investors'");
  }

  if (rows.length < 2) {
    return NextResponse.json({ mode, inserted: 0, skipped: 0, message: mode === 'replace' ? 'Wiped' : 'CSV had no data rows' });
  }

  const idx = indexHeaders(rows[0]);

  const existing = await all<{ name: string }>('SELECT name FROM investors');
  const existingKeys = new Set<string>(existing.map(e => e.name.toLowerCase()));

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  const toNum = (s: string): number => {
    const n = parseFloat((s || '').replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : 0;
  };

  const insertSql = `
    INSERT INTO investors (name, type, commitment, called, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const statements: { sql: string; args: unknown[] }[] = [];
  const flushBatch = async () => {
    if (statements.length === 0) return;
    try { await batch(statements as never); inserted += statements.length; }
    catch (e) { errors.push(`Batch failed: ${e instanceof Error ? e.message : String(e)}`); }
    statements.length = 0;
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === '') continue;

    const name = pick(row, idx, 'name', 'investor', 'investor name');
    if (!name) { skipped++; continue; }

    if (existingKeys.has(name.toLowerCase())) { skipped++; continue; }
    existingKeys.add(name.toLowerCase());

    const type = pick(row, idx, 'type', 'investor type') || null;
    const commitment = toNum(pick(row, idx, 'commitment', 'committed'));
    const called = toNum(pick(row, idx, 'called', 'capital called'));
    const status = pick(row, idx, 'status') || null;
    const notes = pick(row, idx, 'notes') || null;

    statements.push({ sql: insertSql, args: [name, type, commitment, called, status, notes] });
    if (statements.length >= 500) await flushBatch();
  }

  await flushBatch();

  return NextResponse.json({ mode, inserted, skipped, errors: errors.length > 0 ? errors : undefined });
}
