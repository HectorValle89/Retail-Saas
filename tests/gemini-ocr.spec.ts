import { expect, test } from '@playwright/test'
import {
  extractDocumentWithGemini,
  isConfiguredOcrAvailable,
  performConfiguredDocumentOcr,
} from '../src/lib/ocr/gemini'

test('normaliza la respuesta JSON de Gemini para OCR documental', async () => {
  const fetchMock: typeof fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    status: 'ok',
                    documentTypeDetected: 'CURP',
                    employeeName: 'Luis DC',
                    curp: 'BBBB010101HDFLNN02',
                    rfc: 'BBBB010101BBB',
                    nss: '22222222222',
                    address: 'CDMX',
                    employer: null,
                    position: null,
                    documentNumber: 'folio-1',
                    keyDates: ['2026-03-15'],
                    confidenceSummary: 'Documento legible.',
                    mismatchHints: ['Validar nombre legal.'],
                    observations: ['El PDF incluye solo una pagina.'],
                    extractedText: 'CURP BBBB010101HDFLNN02',
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 120,
          candidatesTokenCount: 45,
          totalTokenCount: 165,
        },
      }),
    }) as Response) as typeof fetch

  const result = await extractDocumentWithGemini({
    apiKey: 'secret',
    buffer: Buffer.from('fake'),
    mimeType: 'application/pdf',
    fileName: 'curp.pdf',
    expectedDocumentType: 'CURP',
    employeeName: 'Luis DC',
    fetchImpl: fetchMock,
  })

  expect(result).toMatchObject({
    provider: 'gemini',
    status: 'ok',
    documentTypeExpected: 'CURP',
    documentTypeDetected: 'CURP',
    employeeName: 'Luis DC',
    curp: 'BBBB010101HDFLNN02',
    rfc: 'BBBB010101BBB',
    nss: '22222222222',
  })
  expect(result.keyDates).toEqual(['2026-03-15'])
  expect(result.mismatchHints).toEqual(['Validar nombre legal.'])
  expect(result.usage).toMatchObject({
    promptTokenCount: 120,
    candidatesTokenCount: 45,
    totalTokenCount: 165,
  })
})

test('reporta configuracion faltante cuando OCR gemini no tiene api key', async () => {
  const previousProvider = process.env.OCR_PROVIDER
  const previousKey = process.env.GEMINI_API_KEY

  process.env.OCR_PROVIDER = 'gemini'
  delete process.env.GEMINI_API_KEY

  try {
    const result = await performConfiguredDocumentOcr({
      buffer: Buffer.from('fake'),
      mimeType: 'application/pdf',
      fileName: 'ine.pdf',
      expectedDocumentType: 'INE',
      employeeName: 'Ana Supervisor',
    })

    expect(result.provider).toBe('gemini')
    expect(result.result).toMatchObject({
      status: 'gemini_missing_api_key',
      documentTypeExpected: 'INE',
    })
    expect(isConfiguredOcrAvailable()).toBe(false)
  } finally {
    if (previousProvider === undefined) {
      delete process.env.OCR_PROVIDER
    } else {
      process.env.OCR_PROVIDER = previousProvider
    }

    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = previousKey
    }
  }
})

test('acepta proveedor configurado por override aunque el entorno este deshabilitado', async () => {
  const previousProvider = process.env.OCR_PROVIDER
  const previousKey = process.env.GEMINI_API_KEY

  process.env.OCR_PROVIDER = 'disabled'
  delete process.env.GEMINI_API_KEY

  try {
    const result = await performConfiguredDocumentOcr({
      buffer: Buffer.from('fake'),
      mimeType: 'application/pdf',
      fileName: 'curp.pdf',
      expectedDocumentType: 'CURP',
      employeeName: 'Luis DC',
      providerOverride: 'gemini',
      modelOverride: 'gemini-2.5-flash',
    })

    expect(result.provider).toBe('gemini')
    expect(result.result.status).toBe('gemini_missing_api_key')
  } finally {
    if (previousProvider === undefined) {
      delete process.env.OCR_PROVIDER
    } else {
      process.env.OCR_PROVIDER = previousProvider
    }

    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = previousKey
    }
  }
})
