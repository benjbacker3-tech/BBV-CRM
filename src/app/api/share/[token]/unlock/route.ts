import { NextRequest, NextResponse } from 'next/server';
import { clientIp, liveShare, unlock } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// Public. POST { password } → sets the unlock cookie for this link.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await liveShare(params.token);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: st.status });
  const { password } = await req.json().catch(() => ({ password: '' }));
  const r = await unlock(st.share, String(password || ''), clientIp(req));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(r.cookie!.name, r.cookie!.value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
  return res;
}
