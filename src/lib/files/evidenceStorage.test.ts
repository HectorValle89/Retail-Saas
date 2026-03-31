import { describe, expect, it, vi } from 'vitest'
import { computeSHA256 } from './sha256'
import { storeOptimizedEvidence } from './evidenceStorage'

vi.mock('./documentOptimization', () => ({
  optimizeExpedienteDocument: vi.fn(async () => ({
    buffer: Buffer.from('optimized-file-content'),
    mimeType: 'image/jpeg',
    extension: 'jpg',
    optimizationKind: 'image-jpeg',
    optimized: true,
    originalBytes: 250000,
    optimizedBytes: 1024,
    targetBytes: 100 * 1024,
    targetMet: true,
    notes: ['mock_optimized'],
    thumbnail: {
      buffer: Buffer.from('thumbnail-content'),
      mimeType: 'image/jpeg',
      extension: 'jpg',
      bytes: 128,
      targetBytes: 15 * 1024,
      targetMet: true,
      width: 200,
      height: 150,
    },
    officialAssetKind: 'optimized',
  })),
}))

function buildFakeFile(name: string, type: string) {
  return new File([Buffer.from('source-file-content')], name, { type })
}

function createFakeService(options?: {
  existing?: {
    id: string
    sha256: string
    bucket: string
    ruta_archivo: string
    miniatura_sha256: string | null
    miniatura_bucket: string | null
    miniatura_ruta_archivo: string | null
  } | null
}) {
  const upload = vi.fn(async () => ({ error: null }))
  const insert = vi.fn(async () => ({
    data: {
      id: 'archivo-1',
      sha256: options?.existing?.sha256 ?? 'hash-file',
      bucket: 'operacion-evidencias',
      ruta_archivo: 'expedientes/cuenta/empleado/hash-file.jpg',
      miniatura_sha256: 'hash-thumb',
      miniatura_bucket: 'operacion-evidencias',
      miniatura_ruta_archivo: 'expedientes/cuenta/empleado/hash-file-thumb.jpg',
    },
    error: null,
  }))
  const update = vi.fn(async () => ({ error: null }))
  const maybeSingle = vi.fn(async () => ({
    data: options?.existing ?? null,
    error: null,
  }))

  const service = {
    storage: {
      from: vi.fn(() => ({
        upload,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== 'archivo_hash') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle,
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: insert,
          })),
        })),
        update: vi.fn(() => ({
          eq: update,
        })),
      }
    }),
  }

  return {
    service,
    upload,
    maybeSingle,
    insert,
    update,
  }
}

describe('computeSHA256', () => {
  it('genera el mismo hash para el mismo contenido', async () => {
    const left = await computeSHA256(Buffer.from('same-content'))
    const right = await computeSHA256(new Uint8Array(Buffer.from('same-content')))

    expect(left).toBe(right)
  })

  it('genera hashes distintos para contenidos distintos', async () => {
    const left = await computeSHA256(Buffer.from('content-a'))
    const right = await computeSHA256(Buffer.from('content-b'))

    expect(left).not.toBe(right)
  })
})

describe('storeOptimizedEvidence deduplication', () => {
  it('no realiza segundo upload cuando el hash ya existe', async () => {
    const sha = await computeSHA256(Buffer.from('optimized-file-content'))
    const fake = createFakeService({
      existing: {
        id: 'archivo-existente',
        sha256: sha,
        bucket: 'operacion-evidencias',
        ruta_archivo: 'expedientes/cuenta/empleado/existente.jpg',
        miniatura_sha256: 'thumb-existente',
        miniatura_bucket: 'operacion-evidencias',
        miniatura_ruta_archivo: 'expedientes/cuenta/empleado/existente-thumb.jpg',
      },
    })

    const result = await storeOptimizedEvidence({
      service: fake.service as never,
      bucket: 'operacion-evidencias',
      actorUsuarioId: 'user-1',
      storagePrefix: 'expedientes/cuenta/empleado',
      file: buildFakeFile('evidencia.png', 'image/png'),
    })

    expect(result.deduplicated).toBe(true)
    expect(result.archivo.hash).toBe(sha)
    expect(fake.upload).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
  })
})
