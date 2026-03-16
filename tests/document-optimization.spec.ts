import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import {
  EXPEDIENTE_IMAGE_TARGET_BYTES,
  optimizeExpedienteDocument,
} from '../src/lib/files/documentOptimization'

function buildDenseSvg() {
  const lines = Array.from({ length: 180 }, (_, index) => {
    const y = 120 + index * 18
    const color = index % 2 === 0 ? '#0f172a' : '#1d4ed8'
    return `<text x="80" y="${y}" font-size="16" font-family="Arial" fill="${color}">Documento expediente ${index} - CURP RFC NSS domicilio contrato alta IMSS</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3600"><rect width="100%" height="100%" fill="#ffffff" />${lines}</svg>`
}

test('optimiza imagenes de expediente a un payload operativo', async () => {
  const source = await sharp(Buffer.from(buildDenseSvg())).png().toBuffer()
  expect(source.length).toBeGreaterThan(EXPEDIENTE_IMAGE_TARGET_BYTES)

  const result = await optimizeExpedienteDocument({
    buffer: source,
    mimeType: 'image/png',
    fileName: 'credencial.png',
  })

  expect(result.optimizationKind).toBe('image-jpeg')
  expect(result.mimeType).toBe('image/jpeg')
  expect(result.optimized).toBe(true)
  expect(result.optimizedBytes).toBeLessThanOrEqual(EXPEDIENTE_IMAGE_TARGET_BYTES)
  expect(result.targetMet).toBe(true)
})

test('reescribe PDFs de expediente sin crecer el archivo final', async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const repeatedText = Array.from(
    { length: 120 },
    (_, index) => `Linea ${index} expediente digital para alta IMSS y validacion documental.`
  ).join('\n')

  page.drawText(repeatedText, { x: 36, y: 740, size: 9, lineHeight: 11 })
  pdf.setTitle('Contrato digital expediente')
  pdf.setAuthor('Retail QA')

  const source = Buffer.from(await pdf.save({ useObjectStreams: false }))
  const result = await optimizeExpedienteDocument({
    buffer: source,
    mimeType: 'application/pdf',
    fileName: 'contrato.pdf',
  })

  expect(result.optimizationKind).toBe('pdf-rewrite')
  expect(result.mimeType).toBe('application/pdf')
  expect(result.optimizedBytes).toBeLessThanOrEqual(source.length)
  expect(result.notes.length).toBeGreaterThan(0)
})
