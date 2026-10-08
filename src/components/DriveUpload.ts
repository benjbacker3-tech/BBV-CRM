// Upload a file straight to OneDrive using a Graph upload session. The CRM only
// creates the session; the bytes go browser → OneDrive in 5 MB chunks, so large
// files (drone footage, OMs) aren't limited by the serverless request size.

const CHUNK = 320 * 1024 * 16; // must be a multiple of 320 KiB

export async function uploadToDrive(parentId: string, file: File, onProgress?: (pct: number) => void): Promise<{ id: string; name: string } | null> {
  return uploadViaSession('/api/drive/upload-session', { parentId, name: file.name }, file, onProgress);
}

// `endpoint` answers POST `body` with { uploadUrl } (the CRM's own route, or a share link's).
// Resolves to the created OneDrive item.
export async function uploadViaSession(endpoint: string, body: Record<string, unknown>, file: File, onProgress?: (pct: number) => void): Promise<{ id: string; name: string } | null> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Could not start upload (${res.status})`);

  let item: { id: string; name: string } | null = null;
  for (let start = 0; start < file.size || start === 0; start += CHUNK) {
    const end = Math.min(start + CHUNK, file.size);
    const put = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${start}-${Math.max(end - 1, 0)}/${file.size}` },
      body: file.slice(start, end),
    });
    if (!put.ok && put.status !== 202) throw new Error(`Upload failed at ${Math.round((start / Math.max(file.size, 1)) * 100)}% (${put.status})`);
    if (put.status === 200 || put.status === 201) item = await put.json().catch(() => null);
    onProgress?.(file.size ? end / file.size : 1);
    if (file.size === 0) break;
  }
  return item;
}
