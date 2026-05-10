import { NextRequest, NextResponse } from 'next/server';
import { all, batch, run } from '@/lib/db';
import { parseCSV, indexHeaders, pick } from '@/lib/csv';

export const maxDuration = 60; // Vercel: extend serverless function timeout

// POST /api/contacts/import
// Accepts multipart/form-data:
//   file:  CSV file (required)
//   mode:  'replace' to wipe existing contacts before import, else 'append' (default)
//
// Auto-detects Outlook export columns AND the simple MCI template columns.
// Skips rows with no name/firm/email/phone (truly empty rows).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  const mode = (form.get('mode') as string) || 'append';

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCSV(text);

  // Wipe first if requested. Done as a single batch to save round-trips.
  if (mode === 'replace') {
    await batch([
      { sql: 'DELETE FROM tasks', args: [] },
      { sql: 'DELETE FROM contact_log', args: [] },
      { sql: 'DELETE FROM contacts', args: [] },
      { sql: "DELETE FROM sqlite_sequence WHERE name IN ('contacts','tasks','contact_log')", args: [] },
    ] as never);
  }

  if (rows.length < 2) {
    return NextResponse.json({ mode, inserted: 0, skipped: 0, message: mode === 'replace' ? 'Wiped (no rows to insert)' : 'CSV had no data rows' });
  }

  const headers = rows[0];
  const idx = indexHeaders(headers);

  // Build de-dupe set. Skip the SELECT in replace mode since the table is empty.
  const existingKeys = new Set<string>();
  if (mode !== 'replace') {
    const existing = await all<{ email: string | null; name: string; firm: string | null }>(
      'SELECT email, name, firm FROM contacts'
    );
    for (const c of existing) {
      if (c.email) existingKeys.add(`e:${c.email.toLowerCase()}`);
      existingKeys.add(`n:${(c.name || '').toLowerCase()}|${(c.firm || '').toLowerCase()}`);
    }
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  const insertSql = `
    INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, last_contact, notes)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Build full statement array first; flush in batches of 500 to libsql
  const statements: { sql: string; args: unknown[] }[] = [];
  const flushBatch = async () => {
    if (statements.length === 0) return;
    try {
      await batch(statements as never);
      inserted += statements.length;
    } catch (e) {
      errors.push(`Batch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    statements.length = 0;
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === '') continue; // truly blank line

    // Name: prefer "Name" column. Otherwise build from First/Middle/Last
    let name = pick(row, idx, 'name', 'full name');
    if (!name) {
      const first = pick(row, idx, 'first name', 'firstname');
      const middle = pick(row, idx, 'middle name', 'middlename');
      const last = pick(row, idx, 'last name', 'lastname', 'surname');
      name = [first, middle, last].filter(Boolean).join(' ').trim();
    }

    const firm = pick(row, idx, 'firm', 'company', 'organization', 'employer');
    const email = pick(row, idx, 'email', 'e-mail address', 'email address', 'e-mail 2 address', 'email 2');
    const phone = pick(row, idx,
      'phone', 'mobile phone', 'business phone', 'home phone',
      'primary phone', 'business phone 2', 'other phone', 'company main phone'
    );
    const title = pick(row, idx, 'title', 'job title');
    const businessCity = pick(row, idx, 'business city', 'city');
    const businessState = pick(row, idx, 'business state', 'state');
    const markets = pick(row, idx, 'markets', 'market') ||
      [businessCity, businessState].filter(Boolean).join(', ');
    const typeRaw = pick(row, idx, 'type').toLowerCase();
    const type: 'broker' | 'owner' = typeRaw === 'owner' ? 'owner' : 'broker';
    const warmthRaw = pick(row, idx, 'warmth').toLowerCase();
    const warmth: 'hot' | 'warm' | 'cool' =
      warmthRaw === 'hot' ? 'hot' : warmthRaw === 'warm' ? 'warm' : 'cool';
    const csvNotes = pick(row, idx, 'notes');

    // Compose final notes (include title if present, plus any CSV notes)
    const notesParts = [title && `Title: ${title}`, csvNotes].filter(Boolean);
    const notes = notesParts.join(' — ') || null;

    // Skip rows that are essentially empty
    if (!name && !firm && !email && !phone) {
      skipped++;
      continue;
    }
    // Need at least a name (we'll synthesize from email if absent)
    const finalName = name || email || firm || phone || '';
    if (!finalName) { skipped++; continue; }

    // Dedupe
    const keyEmail = email ? `e:${email.toLowerCase()}` : null;
    const keyName = `n:${finalName.toLowerCase()}|${(firm || '').toLowerCase()}`;
    if ((keyEmail && existingKeys.has(keyEmail)) || existingKeys.has(keyName)) {
      skipped++;
      continue;
    }
    if (keyEmail) existingKeys.add(keyEmail);
    existingKeys.add(keyName);

    statements.push({
      sql: insertSql,
      args: [
        type,
        finalName,
        firm || null,
        phone || null,
        email || null,
        markets || null,
        warmth,
        null, // last_contact
        notes,
      ],
    });

    if (statements.length >= 1000) {
      await flushBatch();
    }
  }

  // Flush remainder
  await flushBatch();

  return NextResponse.json({
    mode,
    inserted,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
