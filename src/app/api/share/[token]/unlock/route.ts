import { NextRequest, NextResponse } from 'next/server';
import { get } from '@/lib/db';
import { Share, clientIp, unlock } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// Public. POST { password } → sets the unlock cookie for this link.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const share = await get<Share>('SELECT * FROM shares WHERE token = ? AND revoked_at IS NULL', [params.token]);
  if (!share) return NextResponse.json({ error: 'This link is no longer active.' }, { status: 404 });
  const { password } = await req.json().catch(() => ({ password: '' }));
  const r = await unlock(share, String(password || ''), clientIp(req));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(r.cookie!.name, r.cookie!.value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
  return res;
}
