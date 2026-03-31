import JSZip from 'jszip'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  convertLoveQrImageForDashboard,
  loadLoveQrZipImages,
  parseLoveQrManifestWorkbook,
  resolveLoveQrSignedUrl,
} from './loveQrImport'

function buildWorkbookBuffer(rows: Array<Array<string>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'QRs')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

describe('loveQrImport', () => {
  it('acepta ID_NOMINA_BC como alias operativo de nomina', () => {
    const buffer = buildWorkbookBuffer([
      ['CODIGO_QR', 'ESTADO_QR', 'IMAGEN_ARCHIVO', 'ID_NOMINA_BC', 'NOMBRE_DC'],
      ['ISDIN-QR-0001', 'ACTIVO', '001-QR.tiff', '594', 'ANA PATRICIA ORTEGA RAMIREZ'],
    ])

    const parsed = parseLoveQrManifestWorkbook(buffer, 'manifiesto.xlsx')

    expect(parsed.sheetName).toBe('QRs')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.idNominaDc).toBe('594')
    expect(parsed.rows[0]?.imagenArchivo).toBe('001-QR.tiff')
    expect(parsed.rows[0]?.motivo).toBe('ASIGNACION_INICIAL')
  })

  it('carga imagenes del ZIP y convierte TIFF a PNG para dashboard', async () => {
    const tiffBuffer = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: '#ffffff',
      },
    })
      .tiff()
      .toBuffer()

    const zip = new JSZip()
    zip.file('001-QR.tiff', tiffBuffer)
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const loaded = await loadLoveQrZipImages(zipBuffer)
    const image = loaded.imagesByName.get('001-qr.tiff')

    expect(loaded.warnings).toHaveLength(0)
    expect(image).not.toBeNull()
    expect(image?.extension).toBe('.tiff')

    const converted = await convertLoveQrImageForDashboard(image!)

    expect(converted.extension).toBe('png')
    expect(converted.mimeType).toBe('image/png')
    expect(converted.originalExtension).toBe('.tiff')
    expect(converted.originalBytes).toBe(tiffBuffer.byteLength)
    expect(converted.hash.length).toBeGreaterThan(10)
  })

  it('firma rutas internas de storage y deja intactas las URLs absolutas', async () => {
    const signed = await resolveLoveQrSignedUrl(
      {
        storage: {
          from: () => ({
            createSignedUrl: async () => ({
              data: { signedUrl: 'https://signed.example/qr.png' },
              error: null,
            }),
          }),
        },
      } as never,
      'operacion-evidencias/love-isdin/qr-codes/isdin/qr.png'
    )

    const passthrough = await resolveLoveQrSignedUrl(
      {
        storage: {
          from: () => ({
            createSignedUrl: async () => ({
              data: { signedUrl: 'https://signed.example/qr.png' },
              error: null,
            }),
          }),
        },
      } as never,
      'https://cdn.example/qr.png'
    )

    expect(signed).toBe('https://signed.example/qr.png')
    expect(passthrough).toBe('https://cdn.example/qr.png')
  })

  it('recupera rutas huérfanas cuando el QR quedó guardado en _orphans del bucket', async () => {
    const signed = await resolveLoveQrSignedUrl(
      {
        storage: {
          from: () => ({
            createSignedUrl: async (route: string) => {
              if (route === 'love-isdin/qr-codes/isdin/qr.png') {
                return {
                  data: null,
                  error: { message: 'Object not found' },
                }
              }

              if (route === '_orphans/2026-03-29/love-isdin/qr-codes/isdin/qr.png') {
                return {
                  data: { signedUrl: 'https://signed.example/orphan-qr.png' },
                  error: null,
                }
              }

              return {
                data: null,
                error: { message: 'Object not found' },
              }
            },
            list: async (route: string) => {
              if (route === '_orphans') {
                return {
                  data: [{ name: '2026-03-29' }],
                  error: null,
                }
              }

              return {
                data: [],
                error: null,
              }
            },
          }),
        },
      } as never,
      'operacion-evidencias/love-isdin/qr-codes/isdin/qr.png'
    )

    expect(signed).toBe('https://signed.example/orphan-qr.png')
  })
})
