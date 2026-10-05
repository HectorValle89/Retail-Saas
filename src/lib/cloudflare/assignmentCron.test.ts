import { describe, expect, it, vi } from 'vitest';
import {
  buildScheduledPublicationRequest,
  runScheduledPublication,
} from './assignmentCron';

describe('assignmentCron', () => {
  it('construye una llamada interna autenticada sin exponer el secreto en la URL', () => {
    const request = buildScheduledPublicationRequest('https://beteele-one.com', 'cron-secret');

    expect(request.method).toBe('GET');
    expect(request.url).toBe(
      'https://beteele-one.com/api/asignaciones/scheduled-publication'
    );
    expect(request.headers.get('x-asignaciones-cron-secret')).toBe('cron-secret');
    expect(request.url).not.toContain('cron-secret');
  });

  it('rechaza la ejecución cuando el secreto no está configurado', async () => {
    const fetcher = vi.fn<(request: Request) => Promise<Response>>();

    await expect(runScheduledPublication(fetcher, '', 'https://beteele-one.com')).rejects.toThrow(
      'ASIGNACIONES_CRON_SECRET no configurado'
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('propaga un fallo HTTP sin incluir el secreto en el error', async () => {
    const fetcher = vi.fn(async () => new Response('detalle interno', { status: 500 }));

    await expect(
      runScheduledPublication(fetcher, 'cron-secret', 'https://beteele-one.com')
    ).rejects.toThrow('PUBLICACION_MENSUAL_PROGRAMADA_FALLO_HTTP_500');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('devuelve el resultado operativo cuando la publicación termina correctamente', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ok: true, months: [{ month: '2026-08' }, { month: '2026-09' }] })
    );

    const response = await runScheduledPublication(
      fetcher,
      'cron-secret',
      'https://beteele-one.com'
    );

    expect(response.status).toBe(200);
  });
});
