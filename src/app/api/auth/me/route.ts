import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE, displayName } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { username: session.username, displayName: displayName(session.username) } });
}
