import { NextRequest, NextResponse } from 'next/server';
import { signSession, validateCredentials, SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { body = {}; }

  const username = validateCredentials(body.username || '', body.password || '');
  if (!username) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const { token, maxAge } = await signSession(username);
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return res;
}
