import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  EXPEDIENTE_IMAGE_TARGET_BYTES,
  EXPEDIENTE_THUMBNAIL_TARGET_BYTES,
  compressImage,
  compressPDF,
  generateThumbnail,
  optimizeExpedienteDocument,
} from './documentOptimization'

function buildDenseSvg(repetitions = 160) {
  const lines = Array.from({ length: repetitions }, (_, index) => {
    const y = 120 + index * 18
    const color = index % 2 === 0 ? '#0f172a' : '#1d4ed8'
    return `<text x="80" y="${y}" font-size="16" font-family="Arial" fill="${color}">Evidencia operativa ${index} - tienda visita selfie ticket gasto Love ISDIN</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3200"><rect width="100%" height="100%" fill="#ffffff" />${lines}</svg>`
}

describe('documentOptimization image pipeline', () => {
  it('genera una imagen oficial optimizada y su miniatura ligera', async () => {
    const source = await sharp(Buffer.from(buildDenseSvg())).png().toBuffer()

    const result = await optimizeExpedienteDocument({
      buffer: source,
      mimeType: 'image/png',
      fileName: 'evidencia.png',
    })

    expect(result.optimizationKind).toBe('image-jpeg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.officialAssetKind).toBe('optimized')
    expect(result.optimizedBytes).toBeLessThanOrEqual(EXPEDIENTE_IMAGE_TARGET_BYTES)
    expect(result.thumbnail).not.toBeNull()
    expect(result.thumbnail?.bytes).toBeLessThanOrEqual(EXPEDIENTE_THUMBNAIL_TARGET_BYTES)
    expect(result.thumbnail?.mimeType).toBe('image/jpeg')
  })

  it('mantiene el output y la miniatura dentro de los limites para entradas SVG variadas', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 40, max: 220 }), async (repetitions) => {
        const source = await sharp(Buffer.from(buildDenseSvg(repetitions))).png().toBuffer()

        const result = await optimizeExpedienteDocument({
          buffer: source,
          mimeType: 'image/png',
          fileName: `evidencia-${repetitions}.png`,
        })

        expect(result.optimizedBytes).toBeLessThanOrEqual(EXPEDIENTE_IMAGE_TARGET_BYTES)
        expect(result.thumbnail).not.toBeNull()
        expect(result.thumbnail?.bytes).toBeLessThanOrEqual(EXPEDIENTE_THUMBNAIL_TARGET_BYTES)
      }),
      { numRuns: 8 }
    )
  }, 20000)
})

describe('documentOptimization public utilities', () => {
  it('expone compressImage(file, maxKB) con target configurable', async () => {
    const source = await sharp(Buffer.from(buildDenseSvg(120))).png().toBuffer()
    const file = new File([new Uint8Array(source)], 'evidencia.png', { type: 'image/png' })

    const result = await compressImage(file, 100)

    expect(result.optimizedBytes).toBeLessThanOrEqual(EXPEDIENTE_IMAGE_TARGET_BYTES)
    expect(result.thumbnail?.bytes).toBeLessThanOrEqual(EXPEDIENTE_THUMBNAIL_TARGET_BYTES)
  })

  it('expone generateThumbnail(file, maxKB) con salida ligera', async () => {
    const source = await sharp(Buffer.from(buildDenseSvg(80))).png().toBuffer()
    const file = new File([new Uint8Array(source)], 'evidencia.png', { type: 'image/png' })

    const thumbnail = await generateThumbnail(file, 20)

    expect(thumbnail).not.toBeNull()
    expect(thumbnail?.bytes).toBeLessThanOrEqual(EXPEDIENTE_THUMBNAIL_TARGET_BYTES)
  })

  it('expone compressPDF(file, maxKB) preservando contrato PDF', async () => {
    const file = new File([new Uint8Array(Buffer.from('%PDF-1.4 fake pdf payload'))], 'doc.pdf', { type: 'application/pdf' })

    const result = await compressPDF(file, 1024)

    expect(result.mimeType).toBe('application/pdf')
    expect(result.targetBytes).toBe(1024 * 1024)
  })

  it('deja pasar el PDF sin compresion aunque exista provider externo configurado', async () => {
    const previousProvider = process.env.PDF_COMPRESSION_PROVIDER
    const previousBaseUrl = process.env.STIRLING_PDF_BASE_URL
    const previousFetch = globalThis.fetch

    process.env.PDF_COMPRESSION_PROVIDER = 'stirling'
    process.env.STIRLING_PDF_BASE_URL = 'http://stirling.local'

    globalThis.fetch = (async (input, init) =>
      ({
        ok: true,
        arrayBuffer: async () => new Uint8Array(Buffer.from('%PDF-1.4 compressed by stirling')).buffer,
      }) as Response) as typeof fetch

    try {
      const result = await optimizeExpedienteDocument({
        buffer: Buffer.from('%PDF-1.4 source'),
        mimeType: 'application/pdf',
        fileName: 'doc.pdf',
      })

      expect(String(result.notes.join(' | '))).toContain('compression_disabled')
      expect(result.optimized).toBe(false)
      expect(result.mimeType).toBe('application/pdf')
    } finally {
      globalThis.fetch = previousFetch
      if (previousProvider === undefined) {
        delete process.env.PDF_COMPRESSION_PROVIDER
      } else {
        process.env.PDF_COMPRESSION_PROVIDER = previousProvider
      }

      if (previousBaseUrl === undefined) {
        delete process.env.STIRLING_PDF_BASE_URL
      } else {
        process.env.STIRLING_PDF_BASE_URL = previousBaseUrl
      }
    }
  })
})
