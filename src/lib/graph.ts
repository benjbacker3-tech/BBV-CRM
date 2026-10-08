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
  file?: { mimeType: string; hashes?: { quickXorHash?: string; sha1Hash?: string } };
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
    // A cached token predates any permission change (e.g. admin consent just granted);
    // drop it and retry once with a fresh one.
    if ((res.status === 401 || res.status === 403) && attempt === 0 && cachedToken) {
      cachedToken = null;
      continue;
    }
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

// /content answers with a redirect to a pre-authenticated URL; fetch follows it and
// drops the Authorization header on the cross-origin hop, which is what we want.
export async function download(id: string): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GRAPH}${drive()}/items/${encodeURIComponent(id)}/content`, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
      cache: 'no-store',
    });
    if ((res.status === 401 || res.status === 403) && attempt === 0) { cachedToken = null; continue; }
    if (!res.ok) throw new GraphError(`Download failed (${res.status})`, res.status);
    return res.arrayBuffer();
  }
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

export async function renameItem(id: string, name: string): Promise<DriveItem> {
  return graph<DriveItem>(`${drive()}/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

// Move into another folder. A same-named item already there is kept and the
// moved one gets a numbered name.
export async function moveItem(id: string, parentId: string): Promise<DriveItem> {
  return graph<DriveItem>(`${drive()}/items/${encodeURIComponent(id)}?@microsoft.graph.conflictBehavior=rename`, {
    method: 'PATCH',
    body: JSON.stringify({ parentReference: { id: parentId } }),
  });
}

// Deleted items go to the OneDrive recycle bin (restorable for 93 days).
export async function deleteItem(id: string): Promise<void> {
  await graph(`${drive()}/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Folder at a path under ROOT_PATH, creating any missing segments.
export async function ensureFolderPath(rel: string): Promise<DriveItem> {
  const existing = await itemByPath(rel);
  if (existing) return existing;
  const segments = rel.split('/').filter(Boolean);
  let parent = await itemByPath('');
  if (!parent) throw new GraphError(`No "${ROOT_PATH}" folder in OneDrive`, 404);
  for (let i = 0; i < segments.length; i++) {
    const here = await itemByPath(segments.slice(0, i + 1).join('/'));
    parent = here ?? (await createFolder(parent.id, segments[i]));
  }
  return parent;
}

// ── Mail (application permissions Mail.Read and, for notifications, Mail.Send) ──

const mailbox = () => `/users/${encodeURIComponent(process.env.MS_DRIVE_USER!)}`;
// Immutable ids stay the same when Ben moves or archives an email, so a review item can
// still be filed afterwards. Graph accepts the older ids in requests too.
const IMMUTABLE = { Prefer: 'IdType="ImmutableId"' };
const MSG_FIELDS = 'id,subject,bodyPreview,receivedDateTime,webLink,conversationId,isDraft,from,parentFolderId';

export interface MailMessage {
  id: string;
  subject: string | null;
  bodyPreview: string;
  receivedDateTime: string;
  webLink: string;
  conversationId: string;
  isDraft: boolean;
  parentFolderId?: string;
  from?: { emailAddress: { name?: string; address?: string } };
}

export async function junkFolderId(): Promise<string> {
  return (await graph<{ id: string }>(`${mailbox()}/mailFolders/junkemail?$select=id`, { headers: IMMUTABLE })).id;
}

export interface MailAttachment {
  '@odata.type': string; // #microsoft.graph.fileAttachment | itemAttachment | referenceAttachment
  id: string;
  name: string;
  contentType: string | null;
  size: number;
  isInline: boolean;
}

// Messages with attachments received (or sent) at or after `since`, oldest first.
// Pass the returned nextLink back in to continue.
export async function messagesWithAttachments(since: string, nextLink?: string): Promise<{ messages: MailMessage[]; nextLink?: string }> {
  const url = nextLink ?? `${mailbox()}/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since} and hasAttachments eq true`)}&$orderby=receivedDateTime asc&$select=${MSG_FIELDS}&$top=25`;
  const page = await graph<{ value: MailMessage[]; '@odata.nextLink'?: string }>(url, { headers: IMMUTABLE });
  return { messages: page.value, nextLink: page['@odata.nextLink'] };
}

export async function messageAttachments(messageId: string): Promise<MailAttachment[]> {
  const res = await graph<{ value: MailAttachment[] }>(`${mailbox()}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`, { headers: IMMUTABLE });
  return res.value;
}

export async function messageById(messageId: string): Promise<MailMessage | null> {
  try {
    return await graph<MailMessage>(`${mailbox()}/messages/${encodeURIComponent(messageId)}?$select=${MSG_FIELDS}`, { headers: IMMUTABLE });
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) return null;
    throw e;
  }
}

export async function attachmentBytes(messageId: string, attachmentId: string): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GRAPH}${mailbox()}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`, {
      headers: { Authorization: `Bearer ${await accessToken()}`, ...IMMUTABLE },
      cache: 'no-store',
    });
    if ((res.status === 401 || res.status === 403) && attempt === 0) { cachedToken = null; continue; }
    if (!res.ok) throw new GraphError(`Attachment download failed (${res.status})`, res.status);
    return res.arrayBuffer();
  }
}

// Save bytes as a new file in a folder (a same-named file there is kept; this one
// gets a numbered name). Small files in one request, larger ones via an upload session.
export async function uploadBytes(parentId: string, name: string, bytes: ArrayBuffer): Promise<DriveItem> {
  const safe = name.replace(/[\/:*?"<>|]/g, '-');
  if (bytes.byteLength < 4 * 1024 * 1024) {
    return graph<DriveItem>(`${drive()}/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(safe)}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', body: bytes });
  }
  const uploadUrl = await createUploadSession(parentId, safe);
  const CHUNK = 320 * 1024 * 32;
  let last: DriveItem | null = null;
  for (let start = 0; start < bytes.byteLength; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.byteLength);
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end - 1}/${bytes.byteLength}` }, body: bytes.slice(start, end) });
    if (!res.ok && res.status !== 202) throw new GraphError(`Upload failed (${res.status})`, res.status);
    if (res.status === 200 || res.status === 201) last = await res.json();
  }
  if (!last) throw new GraphError('Upload did not complete', 500);
  return last;
}

// Pre-authenticated, short-lived download URL for a file.
export async function downloadUrl(id: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GRAPH}${drive()}/items/${encodeURIComponent(id)}/content`, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
      redirect: 'manual',
      cache: 'no-store',
    });
    if ((res.status === 401 || res.status === 403) && attempt === 0) { cachedToken = null; continue; }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) return loc;
    throw new GraphError(`Download link failed (${res.status})`, res.status);
  }
}

// Email Ben (from and to the OneDrive owner's mailbox). Needs Mail.Send; callers
// treat failures as non-fatal.
export async function sendMailToOwner(subject: string, html: string): Promise<void> {
  const to = process.env.NOTIFY_EMAIL || process.env.MS_DRIVE_USER!;
  await graph(`${mailbox()}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: false }),
  });
}
