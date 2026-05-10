import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { SYNC_TAB_NAME, SYNC_FIELDS, parseValue } from '@/lib/excel-sync';

// POST /api/properties/import
// Accepts multipart/form-data with a "file" field containing an .xlsx.
// Looks up the "MCI Pipeline" tab, extracts field/value pairs, and upserts
// the deal in the DB (matched by address).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded. Send as multipart/form-data with field name "file".' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();

  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer as never);
  } catch {
    return NextResponse.json({ error: 'Could not parse file as .xlsx' }, { status: 400 });
  }

  // Find the sync tab — case-insensitive, allows trailing whitespace
  const ws = wb.worksheets.find(s => s.name.trim().toLowerCase() === SYNC_TAB_NAME.toLowerCase());
  if (!ws) {
    const found = wb.worksheets.map(s => s.name).join(', ');
    return NextResponse.json({
      error: `Tab "${SYNC_TAB_NAME}" not found in workbook. Found tabs: ${found || '(none)'}. Download the template and copy that tab into your model.`,
    }, { status: 400 });
  }

  // Build a map of Field label (col A, case-insensitive trim) → value (col B)
  const rawMap = new Map<string, unknown>();
  ws.eachRow({ includeEmpty: false }, row => {
    const key = row.getCell(1).value;
    const val = row.getCell(2).value;
    if (key == null) return;
    const keyStr = String(typeof key === 'object' && key !== null && 'text' in key ? (key as { text: string }).text : key).trim().toLowerCase();
    if (!keyStr) return;
    // unwrap Excel "rich text" objects to plain strings
    let v: unknown = val;
    if (v != null && typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
      v = (v as { text: string }).text;
    }
    if (v != null && typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
      v = (v as { result: unknown }).result;
    }
    rawMap.set(keyStr, v);
  });

  // Map SYNC_FIELDS → parsed values
  const parsed: Record<string, unknown> = {};
  for (const f of SYNC_FIELDS) {
    const v = rawMap.get(f.field.toLowerCase());
    if (v === undefined) continue;
    parsed[f.col] = parseValue(f.kind, v);
  }

  // Must have at least an address
  const address = (parsed.address as string | null) || null;
  if (!address) {
    return NextResponse.json({ error: 'Missing "Address" value in the MCI Pipeline tab.' }, { status: 400 });
  }

  // Default the deal name to the address if blank
  if (!parsed.name) parsed.name = address;

  // Upsert by address (case-insensitive exact match)
  const existing = await get<{ id: number; name: string }>(
    'SELECT id, name FROM deals WHERE LOWER(TRIM(address)) = LOWER(TRIM(?))',
    [address]
  );

  if (existing) {
    // UPDATE — only set fields that were present in the workbook
    const setClauses: string[] = [];
    const args: unknown[] = [];
    for (const [col, val] of Object.entries(parsed)) {
      setClauses.push(`${col} = ?`);
      args.push(val);
    }
    args.push(existing.id);
    await run(`UPDATE deals SET ${setClauses.join(', ')} WHERE id = ?`, args as never);
    await logActivity({
      entity_type: 'deal',
      entity_id: existing.id,
      action: 'imported',
      description: `Deal "${existing.name}" synced from Excel model`,
    });
    return NextResponse.json({ mode: 'updated', id: existing.id, name: existing.name, fields_updated: Object.keys(parsed).length });
  }

  // INSERT — use defaults for any fields not present
  const insertCols = SYNC_FIELDS.map(f => f.col);
  // Also include ios_eligible (default 1) since we don't collect it from Excel
  const allCols = [...insertCols, 'ios_eligible'];
  const allVals = [...insertCols.map(c => parsed[c] ?? null), 1];
  const placeholders = allCols.map(() => '?').join(', ');
  const result = await run(
    `INSERT INTO deals (${allCols.join(', ')}) VALUES (${placeholders})`,
    allVals as never
  );
  await logActivity({
    entity_type: 'deal',
    entity_id: Number(result.lastInsertRowid),
    action: 'imported',
    description: `Deal "${parsed.name}" created from Excel model`,
  });
  return NextResponse.json({ mode: 'created', id: result.lastInsertRowid, name: parsed.name });
}
