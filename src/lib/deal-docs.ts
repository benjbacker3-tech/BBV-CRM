import { run } from './db';
import { Deal } from './utils';
import { DriveItem, children, childrenByPath, download, itemById } from './graph';
import { addressKey, dateFromFilename, modelToDealPatch, parseModel, sameAddress } from './model-parse';

// Standard deal folder (see the folder plan agreed with Ben).
export const STANDARD_SUBFOLDERS = [
  '01 Models', '02 LOI & PSA', '03 Diligence', '04 Debt', '05 Equity', '06 Closing', '07 Leasing & Mgmt', '08 Property Info',
];

// Where deal folders can live, relative to the Sandpiper root.
const DEAL_PARENTS = ['Acquisitions', 'Acquisitions/Dead', 'Portfolio'];

export interface TreeNode extends DriveItem { children?: TreeNode[] }

// Caches folder listings for the length of one request (sync-all touches the
// same parent folders for every deal).
export class DocsContext {
  private cache = new Map<string, Promise<DriveItem[]>>();
  list(rel: string) {
    if (!this.cache.has(rel)) this.cache.set(rel, childrenByPath(rel).catch(() => []));
    return this.cache.get(rel)!;
  }
}

const sameKey = sameAddress;

export async function findDealFolder(deal: Deal, ctx = new DocsContext()): Promise<DriveItem | null> {
  if (deal.drive_folder_id) {
    const item = await itemById(deal.drive_folder_id);
    if (item?.folder) return item;
  }
  const label = deal.address || deal.name;
  const key = addressKey(label);
  if (!key) return null;
  const folders = (await Promise.all(DEAL_PARENTS.map(p => ctx.list(p)))).flat().filter(i => i.folder);
  // Exact street number + name first; otherwise same street name in the same city
  // (covers renumbered addresses like 1962 → 1862 Ives).
  const exact = folders.find(f => sameKey(f.name, label));
  if (exact) return exact;
  const city = (deal.city || '').toLowerCase();
  return folders.find(f => {
    const k = addressKey(f.name);
    return k && k.street === key.street && city && f.name.toLowerCase().includes(city);
  }) ?? null;
}

// Files about this deal that live outside its folder (until the folder cleanup moves them).
export async function relatedFiles(deal: Deal, ctx = new DocsContext()) {
  const label = deal.address || deal.name;
  const [models, lois] = await Promise.all([ctx.list('Prelim Models'), ctx.list('LOIs')]);
  const match = (items: DriveItem[]) => items.filter(i => i.file && sameKey(i.name, label));
  return { prelimModels: match(models), lois: match(lois) };
}

export async function folderTree(id: string, depth = 2): Promise<TreeNode[]> {
  const items = await children(id);
  const sorted = items.sort((a, b) => (a.folder ? 0 : 1) - (b.folder ? 0 : 1) || a.name.localeCompare(b.name));
  if (depth <= 1) return sorted;
  return Promise.all(sorted.map(async i => (i.folder && i.folder.childCount > 0 ? { ...i, children: await folderTree(i.id, depth - 1) } : i)));
}

const isModel = (i: DriveItem) => !!i.file && /\.xls[xm]$/i.test(i.name) && !i.name.startsWith('~$');
const modelDate = (i: DriveItem) => dateFromFilename(i.name) || i.lastModifiedDateTime.slice(0, 10);

// Newest model first: the date in the file name ("… - 09 23 2026.xlsm"), else last modified.
export async function modelCandidates(deal: Deal, folder: DriveItem | null, ctx = new DocsContext()): Promise<DriveItem[]> {
  const found: DriveItem[] = [];
  if (folder) {
    const top = await children(folder.id);
    found.push(...top.filter(isModel));
    for (const sub of top.filter(i => i.folder && /models?/i.test(i.name))) found.push(...(await children(sub.id)).filter(isModel));
  }
  found.push(...(await relatedFiles(deal, ctx)).prelimModels.filter(isModel));
  const unique = Array.from(new Map(found.map(i => [i.id, i])).values());
  return unique.sort((a, b) => modelDate(b).localeCompare(modelDate(a)) || b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime));
}

export type SyncResult =
  | { status: 'updated'; model: string; values: ReturnType<typeof modelToDealPatch> }
  | { status: 'unchanged'; model: string }
  | { status: 'no_model' | 'no_outputs'; model?: string }
  | { status: 'price_mismatch'; model: string; modelPrice: number; dealPrice: number }
  | { status: 'error'; error: string };

// A model underwriting a very different purchase price is a stale or wrong file
// (e.g. an early $3.5M model on an $11M deal); don't let it overwrite the deal.
const priceMismatch = (modelPrice: number | null, dealPrice: number | null | undefined) =>
  !!modelPrice && !!dealPrice && (modelPrice / dealPrice < 0.6 || modelPrice / dealPrice > 1.67);

// Read the deal's newest model and write its outputs onto the deal.
export async function syncDealModel(deal: Deal, ctx = new DocsContext(), force = false): Promise<SyncResult> {
  try {
    const folder = await findDealFolder(deal, ctx);
    if (folder && folder.id !== deal.drive_folder_id) {
      // parentReference.path looks like "/drive/root:/Sandpiper/Acquisitions"
      const parentPath = folder.parentReference?.path?.split('root:')[1] ?? '';
      await run('UPDATE deals SET drive_folder_id = ?, drive_folder_path = ? WHERE id = ?', [folder.id, `${parentPath}/${folder.name}`, deal.id]);
    }
    const candidates = await modelCandidates(deal, folder, ctx);
    if (!candidates.length) return { status: 'no_model' };
    let mismatch: Extract<SyncResult, { status: 'price_mismatch' }> | null = null;
    for (const file of candidates.slice(0, 3)) {
      if (!force && file.id === deal.model_item_id && file.lastModifiedDateTime === deal.model_modified) return { status: 'unchanged', model: file.name };
      const outputs = await parseModel(await download(file.id));
      if (!outputs) continue;
      if (priceMismatch(outputs.price, deal.asking_price)) {
        mismatch ??= { status: 'price_mismatch', model: file.name, modelPrice: outputs.price!, dealPrice: deal.asking_price };
        continue;
      }
      const patch = modelToDealPatch(outputs);
      const extra: Record<string, unknown> = {
        model_item_id: file.id,
        model_name: file.name,
        model_modified: file.lastModifiedDateTime,
        model_synced_at: new Date().toISOString(),
      };
      // Fill size only where the deal has none; never overwrite deal-level specs.
      if (!deal.sf && outputs.sf) extra.sf = outputs.sf;
      if (!deal.acreage && outputs.acres) extra.acreage = outputs.acres;
      const all = { ...patch, ...extra };
      const keys = Object.keys(all).filter(k => all[k as keyof typeof all] !== null && all[k as keyof typeof all] !== undefined);
      await run(`UPDATE deals SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => all[k as keyof typeof all] as string | number), deal.id]);
      return { status: 'updated', model: file.name, values: patch };
    }
    return mismatch ?? { status: 'no_outputs', model: candidates[0].name };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
