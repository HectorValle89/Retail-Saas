import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

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

  const isDermoconsejo =
    nextHostname.startsWith('dermoconsejo.') || allHosts.some((h) => h.startsWith('dermoconsejo.'));

  const isMecanicas =
    nextHostname.startsWith('mecanicas.') ||
    allHosts.some((h) => h.startsWith('mecanicas.')) ||
    nextHostname.startsWith('formularios.') ||
    allHosts.some((h) => h.startsWith('formularios.'));

  const isReportes =
    nextHostname.startsWith('reportes.') || allHosts.some((h) => h.startsWith('reportes.'));

  // Registro de depuración para la consola de Cloudflare
  console.log('[middleware] Captura pública check:', {
    nextHostname,
    allHosts,
    isDermoconsejo,
    isMecanicas,
    isReportes,
    pathname: request.nextUrl.pathname,
  });

  if (isDermoconsejo) {
    const url = request.nextUrl.clone();
    if (url.pathname === '/') {
      url.pathname = '/captura/isdin-mexico';
      return NextResponse.rewrite(url);
    }

    const isPublicCaptura = url.pathname.startsWith('/captura/');
    const isStaticOrApi =
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/);

    if (!isPublicCaptura && !isStaticOrApi) {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  if (isMecanicas) {
    const url = request.nextUrl.clone();
    if (url.pathname === '/') {
      url.pathname = '/formularios/isdin-mexico';
      return NextResponse.rewrite(url);
    }

    const isPublicFormularios = url.pathname.startsWith('/formularios/');
    const isStaticOrApi =
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/);

    if (!isPublicFormularios && !isStaticOrApi) {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  if (isReportes) {
    const url = request.nextUrl.clone();
    if (url.pathname === '/') {
      url.pathname = '/reporte/isdin-mexico';
      return NextResponse.rewrite(url);
    }

    const isPublicReporte = url.pathname.startsWith('/reporte/');
    const isStaticOrApi =
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/);

    if (!isPublicReporte && !isStaticOrApi) {
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
