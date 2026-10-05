import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

const PUBLIC_PORTALS = [
  { hosts: ['dermoconsejo.'], path: '/captura/' },
  { hosts: ['mecanicas.', 'formularios.'], path: '/formularios/' },
  { hosts: ['reportes.'], path: '/reporte/' },
] as const;

export async function middleware(request: NextRequest) {
  const rawHost = request.headers.get('host') ?? '';
  const rawForwardedHost = request.headers.get('x-forwarded-host') ?? '';
  const nextHostname = request.nextUrl.hostname ?? '';

  // Redirigir de forma retrocompatible rutas de mecánicas a formularios
  if (request.nextUrl.pathname === '/mecanicas') {
    const url = request.nextUrl.clone();
    url.pathname = '/formularios';
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname.startsWith('/mecanicas/')) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname.replace('/mecanicas/', '/formularios/');
    return NextResponse.redirect(url);
  }

  // Combinamos todos los posibles hosts y los separamos por comas
  const allHosts = [rawHost, rawForwardedHost]
    .flatMap((h) => h.split(','))
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  // Conserva la prioridad de portales cuando el proxy envía varios hosts.
  for (const portal of PUBLIC_PORTALS) {
    const matchesHost = portal.hosts.some(
      (prefix) =>
        nextHostname.startsWith(prefix) || allHosts.some((host) => host.startsWith(prefix))
    );
    if (!matchesHost) continue;

    const url = request.nextUrl.clone();
    if (url.pathname === '/') {
      url.pathname = `${portal.path}isdin-mexico`;
      return NextResponse.rewrite(url);
    }

    const isPublicRoute = url.pathname.startsWith(portal.path);
    const isStaticOrApi =
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/manifest.webmanifest' ||
      /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(url.pathname);

    if (!isPublicRoute && !isStaticOrApi) {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  try {
    return await updateSession(request);
  } catch (error) {
    console.error('[middleware] updateSession failed', error);
    throw error;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
