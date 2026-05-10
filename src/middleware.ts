import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/auth';

// Routes that don't require authentication
const PUBLIC_PATHS = new Set<string>(['/login']);
const PUBLIC_API_PREFIXES = ['/api/auth/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth on public paths
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    // For API routes, return 401 JSON. For pages, redirect to /login.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Pass through; downstream can read x-mci-user if needed
  const res = NextResponse.next();
  res.headers.set('x-mci-user', session.username);
  return res;
}

// Match all routes except static assets and Next internals
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
