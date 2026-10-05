import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { middleware } from './middleware';
import { updateSession } from '@/lib/supabase/proxy';

vi.mock('@/lib/supabase/proxy', () => ({ updateSession: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('public portal routing', () => {
  it.each([
    ['dermoconsejo', 'captura'],
    ['mecanicas', 'formularios'],
    ['formularios', 'formularios'],
    ['reportes', 'reporte'],
  ])('rewrites the root of %s and preserves its query', async (host, route) => {
    const response = await middleware(
      new NextRequest(`https://${host}.example.com/?periodo=2026-09`)
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      `https://${host}.example.com/${route}/isdin-mexico?periodo=2026-09`
    );
  });

  it.each(['/mecanicas', '/mecanicas/isdin-mexico'])(
    'preserves legacy redirects for %s',
    async (path) => {
      const response = await middleware(
        new NextRequest(`https://example.com${path}?origen=guardado`)
      );
      expect(response.headers.get('location')).toBe(
        `https://example.com${path.replace('/mecanicas', '/formularios')}?origen=guardado`
      );
    }
  );

  it('recognizes forwarded hosts with spaces, ports and mixed case', async () => {
    const response = await middleware(
      new NextRequest('https://internal.example.com/', {
        headers: { 'x-forwarded-host': ' INTERNAL.EXAMPLE.COM, FORMULARIOS.EXAMPLE.COM:443 ' },
      })
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://internal.example.com/formularios/isdin-mexico'
    );
  });

  it('preserves portal priority when proxy headers contain several portals', async () => {
    const response = await middleware(
      new NextRequest('https://reportes.example.com/', {
        headers: { 'x-forwarded-host': 'dermoconsejo.example.com' },
      })
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://reportes.example.com/captura/isdin-mexico'
    );
  });

  it('redirects private paths away from public portals', async () => {
    const response = await middleware(new NextRequest('https://formularios.example.com/nomina'));
    expect(response.headers.get('location')).toBe('https://formularios.example.com/');
  });

  it.each([
    'https://example.com/dashboard',
    'https://dermoconsejo.example.com/captura/isdin-mexico',
    'https://formularios.example.com/formularios/isdin-mexico',
    'https://reportes.example.com/reporte/isdin-mexico',
    'https://formularios.example.com/api/reportes/panel',
    'https://formularios.example.com/_next/static/chunk.js',
    'https://formularios.example.com/logo.png',
  ])('keeps the session boundary for %s', async (url) => {
    const request = new NextRequest(url);
    const expected = NextResponse.next();
    vi.mocked(updateSession).mockResolvedValueOnce(expected);
    expect(await middleware(request)).toBe(expected);
    expect(updateSession).toHaveBeenLastCalledWith(request);
  });

  it('preserves session error context and propagates failures', async () => {
    const error = new Error('session unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(updateSession).mockRejectedValueOnce(error);
    await expect(middleware(new NextRequest('https://example.com/dashboard'))).rejects.toBe(error);
    expect(log).toHaveBeenCalledWith('[middleware] updateSession failed', error);
  });
});
