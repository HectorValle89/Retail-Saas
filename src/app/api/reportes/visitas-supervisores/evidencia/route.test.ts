import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createServiceClientMock,
  requerirPuestosActivosMock,
  createSignedUrlMock,
  generateR2DownloadUrlMock,
  routeQueryMock,
  archivoHashQueryMock,
} =
  vi.hoisted(() => ({
    createServiceClientMock: vi.fn(),
    requerirPuestosActivosMock: vi.fn(),
    createSignedUrlMock: vi.fn(),
    generateR2DownloadUrlMock: vi.fn(),
    routeQueryMock: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    },
    archivoHashQueryMock: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    },
  }))

vi.mock('@/lib/auth/session', () => ({
  requerirPuestosActivos: requerirPuestosActivosMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}))

vi.mock('@/lib/storage/r2Service', () => ({
  generateR2DownloadUrl: generateR2DownloadUrlMock,
}))

import { GET } from './route'

describe('/api/reportes/visitas-supervisores/evidencia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requerirPuestosActivosMock.mockResolvedValue({
      cuentaClienteId: 'cuenta-1',
      empleadoId: 'empleado-1',
      puesto: 'ADMINISTRADOR',
      usuarioId: 'usuario-1',
    })

    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/selfie.jpg' },
      error: null,
    })
    generateR2DownloadUrlMock.mockResolvedValue('https://r2.example/selfie.jpg')

    routeQueryMock.maybeSingle.mockResolvedValue({
      data: {
        id: 'visita-1',
        cuenta_cliente_id: 'cuenta-1',
        supervisor_empleado_id: 'supervisor-1',
        selfie_hash: 'hash-selfie',
        selfie_url: 'operacion-evidencias/ruta-semanal/cuenta-1/supervisor-1/selfie.jpg',
        evidencia_hash: 'hash-evidence',
        evidencia_url: 'operacion-evidencias/ruta-semanal/cuenta-1/supervisor-1/evidencia.jpg',
      },
      error: null,
    })

    archivoHashQueryMock.maybeSingle.mockResolvedValue({
      data: {
        bucket: 'operacion-evidencias',
        ruta_archivo: 'ruta-semanal/cuenta-1/supervisor-1/selfie.jpg',
      },
      error: null,
    })

    createServiceClientMock.mockReturnValue({
      from: vi.fn((table: string) => (table === 'archivo_hash' ? archivoHashQueryMock : routeQueryMock)),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: createSignedUrlMock,
        })),
      },
    })
  })

  it('redirige la selfie a una URL firmada sin exponer la ruta cruda', async () => {
    const request = new NextRequest(
      'https://beteele-one.com/api/reportes/visitas-supervisores/evidencia?visitId=visita-1&kind=selfie'
    )

    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://signed.example/selfie.jpg')
    expect(routeQueryMock.select).toHaveBeenCalledWith(
      'id, cuenta_cliente_id, supervisor_empleado_id, selfie_hash, selfie_url, evidencia_hash, evidencia_url'
    )
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      'ruta-semanal/cuenta-1/supervisor-1/selfie.jpg',
      60 * 60
    )
  })

  it('usa descarga firmada de R2 cuando el archivo vive en CF_R2', async () => {
    archivoHashQueryMock.maybeSingle.mockResolvedValue({
      data: {
        bucket: 'CF_R2',
        ruta_archivo: 'ruta-semanal/cuenta-1/supervisor-1/selfie.jpg',
      },
      error: null,
    })

    const request = new NextRequest(
      'https://beteele-one.com/api/reportes/visitas-supervisores/evidencia?visitId=visita-1&kind=selfie'
    )

    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://r2.example/selfie.jpg')
    expect(generateR2DownloadUrlMock).toHaveBeenCalledWith('ruta-semanal/cuenta-1/supervisor-1/selfie.jpg')
  })

  it('rechaza la evidencia cuando la cuenta no coincide', async () => {
    requerirPuestosActivosMock.mockResolvedValue({
      cuentaClienteId: 'cuenta-2',
      empleadoId: 'empleado-1',
      puesto: 'ADMINISTRADOR',
      usuarioId: 'usuario-1',
    })

    const request = new NextRequest(
      'https://beteele-one.com/api/reportes/visitas-supervisores/evidencia?visitId=visita-1&kind=evidencia'
    )

    const response = await GET(request)

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body).toMatchObject({
      message: 'No tienes permiso para ver esta evidencia.',
    })
  })
})
