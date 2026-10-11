import { all, batch } from './db';
import { DD_TEMPLATE, CM_TEMPLATE, DdItem, DdCost, LEGACY_CATEGORY_KEY, ChecklistList, TemplateItem } from './dd-template';

const TEMPLATES: Record<ChecklistList, TemplateItem[]> = { dd: DD_TEMPLATE, cm: CM_TEMPLATE };

// Add any template lines a deal's checklist doesn't have yet. Safe to call on every
// read: existing rows (and their status/notes) are never touched.
export async function ensureChecklist(dealIds: number[], list: ChecklistList = 'dd'): Promise<void> {
  if (!dealIds.length) return;
  const have = await all<{ deal_id: number; item_key: string }>(
    `SELECT deal_id, item_key FROM dd_items WHERE deal_id IN (${dealIds.map(() => '?').join(',')})`,
    dealIds,
  );
  const seen = new Set(have.map(r => `${r.deal_id}:${r.item_key}`));
  const missing = dealIds.flatMap(dealId =>
    TEMPLATES[list].map((t, i) => ({ ...t, dealId, sort: (i + 1) * 10 })).filter(t => !seen.has(`${t.dealId}:${t.key}`)),
  );
  if (!missing.length) return;
  await batch(missing.map(t => ({
    sql: 'INSERT OR IGNORE INTO dd_items (deal_id, list, item_key, section, grp, label, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [t.dealId, list, t.key, t.section, t.grp ?? null, t.label, t.sort],
  })));
}

export async function checklistItems(dealIds: number[], list: ChecklistList = 'dd'): Promise<DdItem[]> {
  if (!dealIds.length) return [];
  return all<DdItem>(
    `SELECT * FROM dd_items WHERE list = ? AND deal_id IN (${dealIds.map(() => '?').join(',')}) ORDER BY deal_id, sort, id`,
    [list, ...dealIds],
  );
}

export async function dealCosts(dealIds: number[]): Promise<DdCost[]> {
  if (!dealIds.length) return [];
  return all<DdCost>(
    `SELECT * FROM dd_costs WHERE deal_id IN (${dealIds.map(() => '?').join(',')}) ORDER BY deal_id, category, id`,
    dealIds,
  );
}

export interface LegacyNote {
  item_key: string | null;   // checklist line it belongs under; null = general
  category: string;
  vendor: string | null;
  due_date: string | null;
  items: { label: string; status: string }[];
}

// Notes the Outlook sync wrote to the older diligence tables, grouped by category.
export async function legacyNotes(dealId: number): Promise<LegacyNote[]> {
  const cats = await all<{ id: number; category: string; vendor: string | null; due_date: string | null }>(
    'SELECT id, category, vendor, due_date FROM diligence WHERE deal_id = ? ORDER BY id', [dealId],
  );
  if (!cats.length) return [];
  const items = await all<{ diligence_id: number; label: string; status: string }>(
    `SELECT di.diligence_id, di.label, di.status FROM diligence_items di JOIN diligence d ON di.diligence_id = d.id
     WHERE d.deal_id = ? ORDER BY di.id`, [dealId],
  );
  return cats.map(c => ({
    item_key: LEGACY_CATEGORY_KEY[c.category] ?? null,
    category: c.category,
    vendor: c.vendor,
    due_date: c.due_date,
    items: items.filter(i => i.diligence_id === c.id).map(({ label, status }) => ({ label, status })),
  }));
}
