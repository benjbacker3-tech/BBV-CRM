import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { all, get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { SYNC_TAB_NAME, SYNC_FIELDS, parseValue } from '@/lib/excel-sync';
import { addressKey, modelToDealPatch, parseModel } from '@/lib/model-parse';
import { Deal } from '@/lib/utils';

// Same street number + name, else same street name in the same city.
async function matchDeal(label: string, city: string | null): Promise<Deal | undefined> {
  const key = addressKey(label);
  if (!key) return undefined;
  const deals = await all<Deal>('SELECT * FROM deals');
  const exact = deals.find(d => { const k = addressKey(d.address || d.name); return k && k.num === key.num && k.street === key.street; });
  if (exact) return exact;
  const c = (city || '').toLowerCase();
  return deals.find(d => { const k = addressKey(d.address || d.name); return k && k.street === key.street && c && (d.city || '').toLowerCase() === c; });
}

// POST /api/properties/import
// Accepts multipart/form-data with a "file" field containing an .xlsx.
// Looks up the "Sandpiper Pipeline" tab, extracts field/value pairs, and upserts
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

  // No sync tab, but an IOS deal model (Assumptions tab): read its outputs onto the matching deal.
  if (!ws && wb.getWorksheet('Assumptions')) {
    const outputs = await parseModel(arrayBuffer);
    if (!outputs) return NextResponse.json({ error: 'This workbook has an Assumptions tab, but not the IOS model layout (no Total Project Cost / Levered Returns).' }, { status: 400 });
    const fileName = file instanceof File ? file.name : 'model.xlsm';
    const deal = await matchDeal(outputs.address || outputs.name || fileName, outputs.city) ?? await matchDeal(fileName, outputs.city);
    if (!deal) {
      return NextResponse.json({ error: `No deal in the pipeline matches "${outputs.address || fileName}". Add the deal first, then drop the model again.` }, { status: 404 });
    }
    if (req.nextUrl.searchParams.get('dry') === '1') return NextResponse.json({ mode: 'model', dry: true, name: deal.name, outputs });
    const patch: Record<string, unknown> = { ...modelToDealPatch(outputs), model_name: fileName, model_item_id: null, model_modified: null, model_synced_at: new Date().toISOString() };
    if (!deal.sf && outputs.sf) patch.sf = outputs.sf;
    if (!deal.acreage && outputs.acres) patch.acreage = outputs.acres;
    const keys = Object.keys(patch).filter(k => patch[k] !== undefined);
    await run(`UPDATE deals SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => patch[k] as string | number | null), deal.id]);
    await logActivity({ entity_type: 'deal', entity_id: deal.id, action: 'model_synced', description: `Returns and fees updated from ${fileName}` });
    return NextResponse.json({ mode: 'model', name: deal.name, outputs });
  }

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
    return NextResponse.json({ error: 'Missing "Address" value in the Sandpiper Pipeline tab.' }, { status: 400 });
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
