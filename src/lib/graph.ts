// Microsoft Graph access to Ben's OneDrive (Sandpiper Capital LLC tenant).
// App-only auth (client credentials): MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET,
// and MS_DRIVE_USER (the OneDrive owner's sign-in email). The app registration
// needs the Microsoft Graph application permission Files.ReadWrite.All.

const GRAPH = 'https://graph.microsoft.com/v1.0';

// Everything the CRM touches lives under this folder in the drive.
export const ROOT_PATH = process.env.MS_ROOT_PATH || 'Sandpiper';

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  lastModifiedDateTime: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { id?: string; path?: string; driveId?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

export class GraphError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function graphConfigured(): boolean {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_DRIVE_USER);
}

let cachedToken: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GraphError(`Microsoft sign-in failed: ${body.error_description?.split('\r\n')[0] || body.error || res.status}`, res.status);
  cachedToken = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

// Application permissions granted to the app, read from the access token's `roles`
// claim (for diagnosing 401/403s; the token itself is never exposed).
export async function grantedRoles(): Promise<string[]> {
  const payload = (await accessToken()).split('.')[1];
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return Array.isArray(json.roles) ? json.roles : [];
  } catch {
    return [];
  }
}

export async function graph<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('https://') ? path : `${GRAPH}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.body && !(init.body instanceof ArrayBuffer) ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      cache: 'no-store',
    });
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      await new Promise(r => setTimeout(r, Number(res.headers.get('Retry-After') || 2) * 1000));
      continue;
    }
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new GraphError(body.error?.message || `Graph ${res.status}`, res.status);
    return body as T;
  }
}

const drive = () => `/users/${encodeURIComponent(process.env.MS_DRIVE_USER!)}/drive`;
const SELECT = '$select=id,name,size,webUrl,lastModifiedDateTime,folder,file,parentReference';
// Paths are relative to ROOT_PATH; segments are encoded individually.
const encode = (p: string) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const fullPath = (rel: string) => encode([ROOT_PATH, rel].filter(Boolean).join('/'));

export async function itemByPath(rel: string): Promise<DriveItem | null> {
  try {
    return await graph<DriveItem>(`${drive()}/root:/${fullPath(rel)}?${SELECT}`);
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) return null;
    throw e;
  }
}

export async function itemById(id: string): Promise<DriveItem | null> {
  try {
    return await graph<DriveItem>(`${drive()}/items/${encodeURIComponent(id)}?${SELECT}`);
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) return null;
    throw e;
  }
}

export async function children(id: string): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  let next: string | undefined = `${drive()}/items/${encodeURIComponent(id)}/children?${SELECT}&$top=500`;
  while (next) {
    const page: { value: DriveItem[]; '@odata.nextLink'?: string } = await graph(next);
    out.push(...page.value);
    next = page['@odata.nextLink'];
  }
  return out;
}

export async function childrenByPath(rel: string): Promise<DriveItem[]> {
  const item = await itemByPath(rel);
  return item ? children(item.id) : [];
}

// Drive-wide search, trimmed to items under ROOT_PATH when Graph reports the path.
export async function search(q: string): Promise<DriveItem[]> {
  const res = await graph<{ value: DriveItem[] }>(`${drive()}/root/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')?${SELECT}&$top=100`);
  return res.value.filter(i => !i.parentReference?.path || i.parentReference.path.includes(`root:/${ROOT_PATH}`));
}

export async function download(id: string): Promise<ArrayBuffer> {
  const item = await graph<DriveItem>(`${drive()}/items/${encodeURIComponent(id)}?$select=id,@microsoft.graph.downloadUrl`);
  const url = item['@microsoft.graph.downloadUrl'];
  if (!url) throw new GraphError('No download URL for item', 500);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new GraphError(`Download failed (${res.status})`, res.status);
  return res.arrayBuffer();
}

export async function createFolder(parentId: string, name: string): Promise<DriveItem> {
  try {
    return await graph<DriveItem>(`${drive()}/items/${encodeURIComponent(parentId)}/children`, {
      method: 'POST',
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
  } catch (e) {
    if (e instanceof GraphError && e.status === 409) {
      const existing = (await children(parentId)).find(c => c.folder && c.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
    }
    throw e;
  }
}

// Pre-authenticated upload URL; the browser PUTs the file to it in chunks, so
// uploads of any size bypass the serverless request-size limit.
export async function createUploadSession(parentId: string, name: string): Promise<string> {
  const res = await graph<{ uploadUrl: string }>(
    `${drive()}/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(name)}:/createUploadSession`,
    { method: 'POST', body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) }
  );
  return res.uploadUrl;
}

export async function driveOwner(): Promise<{ name: string; webUrl: string }> {
  const d = await graph<{ owner?: { user?: { displayName?: string } }; webUrl: string }>(`${drive()}?$select=owner,webUrl`);
  return { name: d.owner?.user?.displayName || process.env.MS_DRIVE_USER!, webUrl: d.webUrl };
}

// Turn a Graph error into a short message for the UI.
export function graphErrorMessage(e: unknown): string {
  if (e instanceof GraphError) {
    if (e.status === 401 || e.status === 403) return `Microsoft denied access (${e.status}). Check that Files.ReadWrite.All has admin consent and the secret is current. ${e.message}`;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
