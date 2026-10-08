import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { signSession, validateCredentials, SESSION_COOKIE } from '@/lib/auth';

// Failed sign-ins allowed before a pause: per address, and in all (a spread-out guessing
// attempt). Only failures count, so normal use is never slowed.
const PER_IP_15MIN = 10;
const TOTAL_PER_HOUR = 60;

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { body = {}; }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const recent = await get<{ mine: number; total: number }>(
    `SELECT SUM(CASE WHEN ip IS ? AND created_at > datetime('now', '-15 minutes') THEN 1 ELSE 0 END) AS mine, COUNT(*) AS total
     FROM auth_failures WHERE created_at > datetime('now', '-1 hour')`, [ip]);
  if (Number(recent?.mine) >= PER_IP_15MIN || Number(recent?.total) >= TOTAL_PER_HOUR) {
    return NextResponse.json({ error: 'Too many failed sign-ins. Try again in 15 minutes.' }, { status: 429 });
  }

  const username = validateCredentials(body.username || '', body.password || '');
  if (!username) {
    await run('INSERT INTO auth_failures (ip) VALUES (?)', [ip]);
    await run("DELETE FROM auth_failures WHERE created_at < datetime('now', '-1 day')");
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
