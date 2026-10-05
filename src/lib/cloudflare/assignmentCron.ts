const SCHEDULED_PUBLICATION_PATH = '/api/asignaciones/scheduled-publication';

export type ScheduledPublicationFetcher = (request: Request) => Promise<Response>;

export function buildScheduledPublicationRequest(baseUrl: string, secret: string): Request {
  const url = new URL(SCHEDULED_PUBLICATION_PATH, baseUrl);

  return new Request(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'cache-control': 'no-store',
      'x-asignaciones-cron-secret': secret,
    },
  });
}

export async function runScheduledPublication(
  fetcher: ScheduledPublicationFetcher,
  secret: string,
  baseUrl: string
): Promise<Response> {
  if (!secret.trim()) {
    throw new Error('ASIGNACIONES_CRON_SECRET no configurado');
  }

  const response = await fetcher(buildScheduledPublicationRequest(baseUrl, secret));
  if (!response.ok) {
    throw new Error(`PUBLICACION_MENSUAL_PROGRAMADA_FALLO_HTTP_${response.status}`);
  }

  return response;
}
