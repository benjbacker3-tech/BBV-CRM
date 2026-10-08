// Folder cleanup planner. Reads OneDrive (no writes) and proposes operations that
// bring deal folders in line with the agreed methodology:
//   - A deal gets a folder once its LOI is accepted (Negotiating PSA / Under Contract)
//     under Acquisitions/; Closed deals live under Portfolio/; Dead deals under
//     Acquisitions/Dead/ (Dead deals never get a new folder).
//   - Every deal folder has the 8 standard subfolders. Legacy subfolders are renamed
//     (Models → 01 Models, Legal → 02 LOI & PSA, …); other items are sorted by name.
//   - A deal's models in Prelim Models and its LOIs in LOIs/ move into its folder.
//   - Byte-identical duplicates are removed, keeping a copy in the right folder.
// Ops are applied by applyOps(); deletes go to the OneDrive recycle bin.

import { all } from './db';
import { Deal } from './utils';
import { DriveItem, children, createFolder, deleteItem, ensureFolderPath, itemByPath, moveItem, renameItem } from './graph';
import { STANDARD_SUBFOLDERS } from './deal-docs';
import { addressKey, sameAddress } from './model-parse';

export type CleanupOp =
  | { id: string; kind: 'create_folder'; path: string; reason: string; defaultOn: boolean }
  | { id: string; kind: 'rename'; itemId: string; path: string; newName: string; reason: string; defaultOn: boolean }
  | { id: string; kind: 'move'; itemId: string; path: string; toFolder: string; isFolder: boolean; dealFolder?: boolean; reason: string; defaultOn: boolean }
  | { id: string; kind: 'delete'; itemId: string; path: string; keep: string; reason: string; defaultOn: boolean };

export interface CleanupGroup { title: string; stage: string | null; folder: string; ops: CleanupOp[] }
export interface CleanupPlan { groups: CleanupGroup[]; notes: string[] }

const STAGE_PARENT: Record<string, string> = {
  'Negotiating PSA': 'Acquisitions',
  'Under Contract': 'Acquisitions',
  Closed: 'Portfolio',
  Dead: 'Acquisitions/Dead',
};

// Legacy subfolder names that become a standard subfolder by renaming.
const LEGACY: Record<string, string[]> = {
  '01 Models': ['models', 'model'],
  '02 LOI & PSA': ['legal', 'loi', 'psa', 'contracts', 'contract'],
  '03 Diligence': ['diligence', 'due diligence', 'dd'],
  '04 Debt': ['debt', 'financing', 'lender'],
  '05 Equity': ['equity', 'jv'],
  '06 Closing': ['closing'],
  '07 Leasing & Mgmt': ['management', 'leasing', 'mgmt', 'property management'],
  '08 Property Info': ['property info', 'marketing'],
  '09 Construction': ['construction', 'gc', 'capex', 'permitting'],
};

// Which standard subfolder an item belongs in, from its name. Null = can't tell (left alone).
export function categoryOf(name: string, isFolder: boolean): string | null {
  const n = name.toLowerCase();
  if (!isFolder && /\.xlsm$/.test(n)) return '01 Models';
  if (!isFolder && /\.xlsx?$/.test(n) && /model/.test(n)) return '01 Models';
  if (/\blease\b|estoppel|\bsnda\b|\bpma\b|property management|insurance|tax (bill|estimate)|rent roll|statement of values|\bcoi\b|certificate of insurance/.test(n)) return '07 Leasing & Mgmt';
  if (/\bloi\b|letter of intent|\bpsa\b|purchase (and|&) sale|commission agreement|listing agreement|em receipt|release of em|earnest money/.test(n)) return '02 LOI & PSA';
  if (/term sheet|financing|\bloan\b|lender/.test(n)) return '04 Debt';
  if (/construction|\bgc\b|general contractor|pay app|draw request|lien waiver|change order|schedule of values|scope of work|\bw-?9\b|\bach\b|certificate of registration|\bcontract\b.*\broof|\broof\b.*\bcontract\b/.test(n)) return '09 Construction';
  if (/wire instructions|settlement statement|closing statement|invoices for escrow|escrow invoice/.test(n)) return '06 Closing';
  if (/brochure|\bom\b|offering memo|site plan|floor plan|\bdrone\b|\bphotos?\b|pictures|\bdecks?\b|aerial/.test(n) || (!isFolder && /\.(jpe?g|png|heic)$/.test(n))) return '08 Property Info';
  if (/phase i\b|phase ii|\besa\b|\bpca\b|survey|\btitle\b|zoning|\bpzr\b|permit|\broof\b|geotech|soils|environmental|proposal/.test(n)) return '03 Diligence';
  return null;
}

// "724 W Taylor Ave" → "724 W Taylor" (folder names drop the street suffix).
const shortAddress = (a: string) => a.replace(/\s+(ave|avenue|st|street|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|pkwy|parkway|hwy|pl|place)\.?$/i, '').trim();

const CITY_STATE: Record<string, string> = {
  denver: 'CO', 'commerce city': 'CO', englewood: 'CO', brighton: 'CO', henderson: 'CO', aurora: 'CO',
  kent: 'WA', tacoma: 'WA', puyallup: 'WA', seattle: 'WA', pacific: 'WA', auburn: 'WA', sumner: 'WA',
  meridian: 'ID', boise: 'ID', 'las vegas': 'NV', 'north las vegas': 'NV', phoenix: 'AZ', madison: 'WI', houston: 'TX',
};
const folderNameFor = (d: Deal) => {
  const st = d.state || CITY_STATE[(d.city || '').toLowerCase()] || '';
  return [shortAddress(d.address || d.name), d.city, st].filter(Boolean).join(', ').replace(/[\\/:*?"<>|]/g, '-');
};

interface Node { item: DriveItem; path: string; children: Node[] }

async function loadTree(item: DriveItem, path: string, depth = 8): Promise<Node[]> {
  if (depth <= 0) return [];
  const kids = await children(item.id);
  return Promise.all(kids.map(async k => ({
    item: k,
    path: `${path}/${k.name}`,
    children: k.folder && k.folder.childCount > 0 ? await loadTree(k, `${path}/${k.name}`, depth - 1) : [],
  })));
}

const safeChildren = async (rel: string) => {
  const it = await itemByPath(rel);
  return it ? children(it.id) : [];
};

interface Subject {
  title: string;
  deal: Deal | null;
  stage: string | null;
  existing: DriveItem | null;
  existingPath: string | null; // where it is now
  folderPath: string;          // where it should be
}

export async function planCleanup(onlyDealId?: number): Promise<CleanupPlan> {
  const deals = await all<Deal>('SELECT * FROM deals');
  const [acq, dead, portfolio, prelim, prelimArchive, lois] = await Promise.all([
    safeChildren('Acquisitions'), safeChildren('Acquisitions/Dead'), safeChildren('Portfolio'),
    safeChildren('Prelim Models'), safeChildren('Prelim Models/Archive'), safeChildren('LOIs'),
  ]);
  const folders = [
    ...acq.filter(f => f.folder && f.name.toLowerCase() !== 'dead').map(f => ({ item: f, parent: 'Acquisitions' })),
    ...dead.filter(f => f.folder).map(f => ({ item: f, parent: 'Acquisitions/Dead' })),
    ...portfolio.filter(f => f.folder).map(f => ({ item: f, parent: 'Portfolio' })),
  ];
  const notes: string[] = [];

  // Who gets a folder: CRM deals by stage, plus existing folders no deal claims.
  const subjects: Subject[] = [];
  const claimed = new Set<string>();
  for (const d of deals) {
    if (onlyDealId != null && d.id !== onlyDealId) continue;
    const label = d.address || d.name;
    const match = folders.find(f => f.item.id === d.drive_folder_id) ?? folders.find(f => sameAddress(f.item.name, label));
    const parent = STAGE_PARENT[d.stage];
    if (match) claimed.add(match.item.id);
    if (!parent) continue; // Tracking / LOI Submitted: no folder until the LOI is accepted
    if (d.stage === 'Dead' && !match) continue;
    const name = match ? match.item.name : folderNameFor(d);
    subjects.push({
      title: label, deal: d, stage: d.stage,
      existing: match?.item ?? null,
      existingPath: match ? `${match.parent}/${match.item.name}` : null,
      folderPath: `${parent}/${name}`,
    });
  }
  for (const f of onlyDealId != null ? [] : folders) {
    if (claimed.has(f.item.id)) continue;
    subjects.push({ title: f.item.name, deal: null, stage: null, existing: f.item, existingPath: `${f.parent}/${f.item.name}`, folderPath: `${f.parent}/${f.item.name}` });
  }

  // Contents expected in each destination folder (existing + planned arrivals), to detect name clashes.
  const contents = new Map<string, Map<string, { hash?: string; path: string }>>();
  const slot = (folder: string) => { if (!contents.has(folder)) contents.set(folder, new Map()); return contents.get(folder)!; };
  const deleted = new Set<string>();
  const pulled = new Set<string>();
  const groups: CleanupGroup[] = [];
  const trees = new Map<Subject, Node[]>();

  // Pass 1: load trees and register existing contents of standard folders (by final path).
  const finalTop = new Map<Subject, Map<string, string>>(); // top-level item id → final name
  for (const s of subjects) {
    const tree = s.existing ? await loadTree(s.existing, s.existingPath!) : [];
    trees.set(s, tree);
    const names = new Map<string, string>();
    const top = tree;
    for (const std of STANDARD_SUBFOLDERS) {
      if (top.some(n => n.item.folder && n.item.name === std)) continue;
      const legacy = top.find(n => n.item.folder && !names.has(n.item.id) && LEGACY[std].includes(n.item.name.toLowerCase()));
      if (legacy) names.set(legacy.item.id, std);
    }
    finalTop.set(s, names);
    for (const n of top) {
      const finalName = names.get(n.item.id) ?? n.item.name;
      if (!n.item.folder || !STANDARD_SUBFOLDERS.includes(finalName)) continue;
      for (const c of n.children) slot(`${s.folderPath}/${finalName}`).set(c.item.name.toLowerCase(), { hash: c.item.file?.hashes?.quickXorHash, path: `${s.folderPath}/${finalName}/${c.item.name}` });
    }
  }

  // Pass 2: ops per subject.
  for (const s of subjects) {
    const ops: CleanupOp[] = [];
    const tree = trees.get(s)!;
    const renames = finalTop.get(s)!;

    // Folder itself
    if (!s.existing) {
      ops.push({ id: `create:${s.folderPath}`, kind: 'create_folder', path: s.folderPath, reason: `${s.stage}: deal folder with the 8 standard subfolders`, defaultOn: true });
    } else if (s.existingPath !== s.folderPath) {
      const to = s.folderPath.slice(0, s.folderPath.lastIndexOf('/'));
      ops.push({ id: `move:${s.existing.id}`, kind: 'move', itemId: s.existing.id, path: s.existingPath!, toFolder: to, isFolder: true, dealFolder: true, reason: `Deal is ${s.stage}`, defaultOn: true });
    }

    // Standard subfolders: rename legacy ones, create the rest
    for (const std of STANDARD_SUBFOLDERS) {
      if (tree.some(n => n.item.folder && n.item.name === std)) continue;
      const legacy = tree.find(n => renames.get(n.item.id) === std);
      if (legacy) ops.push({ id: `rename:${legacy.item.id}`, kind: 'rename', itemId: legacy.item.id, path: `${s.folderPath}/${legacy.item.name}`, newName: std, reason: 'Standard subfolder name', defaultOn: true });
      else if (s.existing) ops.push({ id: `create:${s.folderPath}/${std}`, kind: 'create_folder', path: `${s.folderPath}/${std}`, reason: 'Standard subfolder', defaultOn: true });
    }

    const moved = new Map<string, string>(); // item id → destination folder
    const planMove = (n: Node, fromPath: string, toFolder: string, reason: string) => {
      const target = slot(toFolder);
      const key = n.item.name.toLowerCase();
      const there = target.get(key);
      const hash = n.item.file?.hashes?.quickXorHash;
      if (there && hash && there.hash === hash) {
        deleted.add(n.item.id);
        ops.push({ id: `delete:${n.item.id}`, kind: 'delete', itemId: n.item.id, path: fromPath, keep: there.path, reason: 'Identical copy already in the right folder', defaultOn: true });
        return;
      }
      target.set(key, { hash, path: `${toFolder}/${n.item.name}` });
      moved.set(n.item.id, toFolder);
      ops.push({ id: `move:${n.item.id}`, kind: 'move', itemId: n.item.id, path: fromPath, toFolder, isFolder: !!n.item.folder, reason, defaultOn: true });
    };

    // Items to sort: loose items at the top, and direct children of standard folders
    // whose name clearly belongs elsewhere.
    const otherSubject = (name: string) => {
      if (!addressKey(name) || sameAddress(name, s.title)) return null;
      return subjects.find(o => o !== s && (sameAddress(name, o.title) || (o.existing && sameAddress(name, o.existing.name)))) ?? null;
    };
    const unsorted: string[] = [];
    for (const n of tree) {
      const finalName = renames.get(n.item.id) ?? n.item.name;
      const isStd = n.item.folder && STANDARD_SUBFOLDERS.includes(finalName);
      if (!isStd) {
        const other = otherSubject(n.item.name);
        const cat = categoryOf(n.item.name, !!n.item.folder);
        const from = `${s.folderPath}/${n.item.name}`;
        if (other) planMove(n, from, `${other.folderPath}/${cat ?? '03 Diligence'}`, `Belongs to ${other.title}`);
        else if (cat) planMove(n, from, `${s.folderPath}/${cat}`, `Sorted by name → ${cat}`);
        else unsorted.push(n.item.name);
        continue;
      }
      for (const c of n.children) {
        const from = `${s.folderPath}/${finalName}/${c.item.name}`;
        const other = otherSubject(c.item.name);
        const cat = categoryOf(c.item.name, !!c.item.folder);
        if (other) planMove(c, from, `${other.folderPath}/${cat ?? finalName}`, `Belongs to ${other.title}`);
        else if (cat && cat !== finalName) planMove(c, from, `${s.folderPath}/${cat}`, `Sorted by name → ${cat}`);
      }
    }
    if (unsorted.length) notes.push(`${s.title}: left at the top of the folder (couldn't tell where they go): ${unsorted.join(', ')}`);

    // Pull in this deal's models and LOIs from the holding folders
    const pull = (items: DriveItem[], fromFolder: string, to: string, what: string) => {
      for (const it of items) {
        if (!it.file || !sameAddress(it.name, s.title) || deleted.has(it.id) || moved.has(it.id)) continue;
        pulled.add(it.id);
        planMove({ item: it, path: `${fromFolder}/${it.name}`, children: [] }, `${fromFolder}/${it.name}`, `${s.folderPath}/${to}`, what);
      }
    };
    pull(prelim, 'Prelim Models', '01 Models', 'Model from Prelim Models');
    pull(prelimArchive, 'Prelim Models/Archive', '01 Models', 'Model from Prelim Models/Archive');
    pull(lois, 'LOIs', '02 LOI & PSA', 'LOI from the LOIs folder');

    // Byte-identical duplicates inside the deal folder: keep the copy in its right
    // subfolder (or the shortest path), remove the rest.
    const files: { n: Node; finalPath: string }[] = [];
    const walk = (nodes: Node[], parentFinal: string) => {
      for (const n of nodes) {
        if (deleted.has(n.item.id)) continue;
        const dest = moved.get(n.item.id);
        const top = parentFinal === s.folderPath ? (renames.get(n.item.id) ?? n.item.name) : n.item.name;
        const finalPath = dest ? `${dest}/${n.item.name}` : `${parentFinal}/${top}`;
        if (n.item.file?.hashes?.quickXorHash && (n.item.size ?? 0) > 0) files.push({ n, finalPath });
        if (n.children.length) walk(n.children, finalPath);
      }
    };
    walk(tree, s.folderPath);
    const byHash = new Map<string, typeof files>();
    for (const f of files) {
      const h = f.n.item.file!.hashes!.quickXorHash!;
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h)!.push(f);
    }
    byHash.forEach(group => {
      if (group.length < 2) return;
      const right = (f: { n: Node; finalPath: string }) => {
        const cat = categoryOf(f.n.item.name, false);
        const sub = f.finalPath.slice(s.folderPath.length + 1).split('/')[0];
        return cat ? sub === cat : false;
      };
      // Prefer: the right subfolder, then a clean name (no "(1)" / "Copy"), then a dated name, then the shortest path.
      const clean = (f: { n: Node }) => !/\(\d+\)|\bcopy\b/i.test(f.n.item.name);
      const dated = (f: { n: Node }) => /\d{1,2}[-. ]\d{1,2}[-. ]\d{2,4}/.test(f.n.item.name);
      const keeper = [...group].sort((a, b) =>
        Number(right(b)) - Number(right(a)) || Number(clean(b)) - Number(clean(a)) || Number(dated(b)) - Number(dated(a)) || a.finalPath.length - b.finalPath.length)[0];
      for (const f of group) {
        if (f === keeper) continue;
        deleted.add(f.n.item.id);
        const current = f.n.path.replace(s.existingPath ?? s.folderPath, s.folderPath);
        ops.push({ id: `delete:${f.n.item.id}`, kind: 'delete', itemId: f.n.item.id, path: current, keep: keeper.finalPath, reason: 'Identical duplicate', defaultOn: true });
      }
    });

    // A .zip next to a folder of the same name is usually the download it was unpacked from.
    const zips = files.filter(f => /\.zip$/i.test(f.n.item.name));
    for (const z of zips) {
      const base = z.n.item.name.replace(/\.zip$/i, '').toLowerCase();
      const twin = (function find(nodes: Node[]): Node | null {
        for (const n of nodes) { if (n.item.folder && n.item.name.toLowerCase() === base) return n; const f = find(n.children); if (f) return f; }
        return null;
      })(tree);
      if (twin && !deleted.has(z.n.item.id)) {
        ops.push({ id: `delete:${z.n.item.id}`, kind: 'delete', itemId: z.n.item.id, path: z.n.path.replace(s.existingPath ?? s.folderPath, s.folderPath), keep: twin.path.replace(s.existingPath ?? s.folderPath, s.folderPath), reason: 'Zip of a folder that is already unpacked here (check before applying)', defaultOn: false });
      }
    }

    // A file both moved and then found to be a duplicate only needs the delete.
    const finalOps = ops.filter(o => !(o.kind === 'move' && deleted.has(o.itemId) && !o.isFolder));
    if (finalOps.length) groups.push({ title: s.title, stage: s.stage, folder: s.folderPath, ops: finalOps });
  }

  // Holding-folder leftovers that aren't CRM deals
  const dealLabels = deals.map(d => d.address || d.name);
  const strayLois = Array.from(new Set(lois.filter(l => l.file && !pulled.has(l.id) && !dealLabels.some(d => sameAddress(l.name, d)) && addressKey(l.name)).map(l => {
    const k = addressKey(l.name)!; return l.name.slice(0, l.name.toLowerCase().indexOf(' loi') > 0 ? l.name.toLowerCase().indexOf(' loi') : undefined).trim() || `${k.num} ${k.street}`;
  })));
  if (strayLois.length) notes.push(`LOIs/ also holds LOIs for ${strayLois.length} properties that aren't in the CRM: ${strayLois.join(', ')}. They stay there until those deals are added and accepted.`);

  // Order: folder-level first so later moves find their destinations
  const rank = (o: CleanupOp) => (o.kind === 'move' && o.dealFolder ? 0 : o.kind === 'create_folder' ? 1 : o.kind === 'rename' ? 2 : o.kind === 'move' ? 3 : 4);
  for (const g of groups) g.ops.sort((a, b) => rank(a) - rank(b));
  return { groups, notes };
}

export interface OpResult { id: string; ok: boolean; error?: string }

// Applies ops in the order given. Missing destination folders are created on the way.
export async function applyOps(ops: CleanupOp[]): Promise<OpResult[]> {
  const results: OpResult[] = [];
  const folderCache = new Map<string, string>();
  const folderId = async (path: string) => {
    if (!folderCache.has(path)) folderCache.set(path, (await ensureFolderPath(path)).id);
    return folderCache.get(path)!;
  };
  for (const op of ops) {
    try {
      if (op.kind === 'create_folder') {
        await folderId(op.path);
        if (!/\/0\d [^/]+$/.test(op.path)) {
          // a deal folder: give it the standard subfolders
          const parent = await folderId(op.path);
          for (const sub of STANDARD_SUBFOLDERS) folderCache.set(`${op.path}/${sub}`, (await createFolder(parent, sub)).id);
        }
      } else if (op.kind === 'rename') {
        await renameItem(op.itemId, op.newName);
        folderCache.clear();
      } else if (op.kind === 'move') {
        await moveItem(op.itemId, await folderId(op.toFolder));
        if (op.isFolder) folderCache.clear();
      } else if (op.kind === 'delete') {
        await deleteItem(op.itemId);
      }
      results.push({ id: op.id, ok: true });
    } catch (e) {
      results.push({ id: op.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

// Bring one deal's folder in line with its stage (create / move / sort / pull in its
// models and LOIs). Never deletes; duplicate removal only happens from the review page.
export async function organizeDeal(dealId: number): Promise<OpResult[]> {
  const plan = await planCleanup(dealId);
  const ops = plan.groups.flatMap(g => g.ops).filter(o => o.kind !== 'delete');
  return applyOps(ops);
}
