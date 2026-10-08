import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { hashPassword } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// GET → the link's activity log.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const events = await all('SELECT kind, detail, ip, created_at FROM share_events WHERE share_id = ? ORDER BY created_at DESC LIMIT 200', [params.id]);
  return NextResponse.json({ events });
}

// PATCH { action: 'revoke' | 'restore' } | { expiresDays } | { password } | { notify }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const id = Number(params.id);
  if (!(await get('SELECT id FROM shares WHERE id = ?', [id]))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (b.action === 'revoke') await run("UPDATE shares SET revoked_at = datetime('now') WHERE id = ?", [id]);
  if (b.action === 'restore') await run('UPDATE shares SET revoked_at = NULL WHERE id = ?', [id]);
  if ('expiresDays' in b) {
    const days = Number(b.expiresDays);
    await run('UPDATE shares SET expires_at = ? WHERE id = ?', [days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null, id]);
  }
  if ('password' in b) await run('UPDATE shares SET password_hash = ? WHERE id = ?', [b.password ? hashPassword(String(b.password)) : null, id]);
  if ('notify' in b) await run('UPDATE shares SET notify = ? WHERE id = ?', [b.notify ? 1 : 0, id]);
  return NextResponse.json({ ok: true });
}
