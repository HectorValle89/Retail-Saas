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
                    address: 'Av Reforma 100, Col Centro, CDMX',
                    postalCode: '06000',
                    phoneNumber: '5512345678',
                    email: 'luis@example.com',
                    birthDate: '2001-01-01',
                    employmentStartDate: '2024-02-15',
                    age: 25,
                    yearsWorking: 2,
                    sex: 'MASCULINO',
                    maritalStatus: 'SOLTERO',
                    originPlace: 'Puebla',
                    dailyBaseSalary: 412.55,
                    addressSourceDocumentType: 'COMPROBANTE_DOMICILIO',
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
    postalCode: '06000',
    birthDate: '2001-01-01',
    employmentStartDate: '2024-02-15',
    age: 25,
    yearsWorking: 2,
    sex: 'MASCULINO',
    maritalStatus: 'SOLTERO',
    originPlace: 'Puebla',
    addressSourceDocumentType: 'COMPROBANTE_DOMICILIO',
  })
  expect(result.keyDates).toEqual(['2026-03-15'])
  expect(result.mismatchHints).toEqual(['Validar nombre legal.'])
  expect(result.usage).toMatchObject({
    promptTokenCount: 120,
    candidatesTokenCount: 45,
    totalTokenCount: 165,
  })
})

test('mantiene prioridad declarativa de comprobante de domicilio para direccion', async () => {
  const fetchMock: typeof fetch = (async (_input, init) =>
    ({
      ok: true,
      json: async () => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          contents?: Array<{ parts?: Array<{ text?: string }> }>
        }
        const prompt = body.contents?.[0]?.parts?.[0]?.text ?? ''

        expect(prompt).toContain('Prioriza SIEMPRE el comprobante de domicilio por encima de la INE')

        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      status: 'needs_review',
                      documentTypeDetected: 'EXPEDIENTE_COMPLETO',
                      employeeName: 'Ana',
                      address: 'Calle 1',
                      addressSourceDocumentType: 'COMPROBANTE_DOMICILIO',
                    }),
                  },
                ],
              },
            },
          ],
        }
      },
    }) as Response) as typeof fetch

  const result = await extractDocumentWithGemini({
    apiKey: 'secret',
    buffer: Buffer.from('fake'),
    mimeType: 'application/pdf',
    fileName: 'expediente.pdf',
    expectedDocumentType: 'EXPEDIENTE_COMPLETO',
    employeeName: 'Ana',
    fetchImpl: fetchMock,
  })

  expect(result.addressSourceDocumentType).toBe('COMPROBANTE_DOMICILIO')
})

test('declara fuentes oficiales estrictas y limita CV solo a telefono y correo', async () => {
  const fetchMock: typeof fetch = (async (_input, init) =>
    ({
      ok: true,
      json: async () => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          contents?: Array<{ parts?: Array<{ text?: string }> }>
        }
        const prompt = body.contents?.[0]?.parts?.[0]?.text ?? ''

        expect(prompt).toContain('FUENTES AUTORIZADAS POR CAMPO:')
        expect(prompt).toContain('rfc: usar solo constancia de situacion fiscal / RFC oficial del SAT')
        expect(prompt).toContain('nss: usar solo carta de derechos del IMSS / documento oficial donde aparezca el NSS')
        expect(prompt).toContain('phoneNumber y email: usar solo CV o solicitud del candidato')
        expect(prompt).toContain('DOCUMENTOS IRRELEVANTES PARA DATOS PERSONALES:')

        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      status: 'needs_review',
                      documentTypeDetected: 'EXPEDIENTE_COMPLETO',
                      employeeName: 'ANA LOPEZ',
                      curp: 'AULA900101MDFPRN01',
                      rfc: null,
                      nss: '12345678901',
                      address: 'CALLE 1 100',
                      postalCode: '06000',
                      phoneNumber: '5512345678',
                      email: 'ana@example.com',
                      birthDate: '1990-01-01',
                      addressSourceDocumentType: 'COMPROBANTE_DOMICILIO',
                      mismatchHints: ['El RFC solo aparece en un CV y fue descartado por no ser oficial.'],
                      observations: ['Telefono y correo se tomaron del CV; el resto de datos no oficiales se ignoraron.'],
                    }),
                  },
                ],
              },
            },
          ],
        }
      },
    }) as Response) as typeof fetch

  const result = await extractDocumentWithGemini({
    apiKey: 'secret',
    buffer: Buffer.from('fake'),
    mimeType: 'application/pdf',
    fileName: 'expediente.pdf',
    expectedDocumentType: 'EXPEDIENTE_COMPLETO',
    employeeName: 'Ana Lopez',
    fetchImpl: fetchMock,
  })

  expect(result).toMatchObject({
    status: 'needs_review',
    rfc: null,
    nss: '12345678901',
    phoneNumber: '5512345678',
    email: 'ana@example.com',
    addressSourceDocumentType: 'COMPROBANTE_DOMICILIO',
  })
  expect(result.mismatchHints).toContain(
    'El RFC solo aparece en un CV y fue descartado por no ser oficial.'
  )
})

test('traduce al espanol los mensajes narrativos cuando Gemini responde en ingles', async () => {
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
                    status: 'needs_review',
                    documentTypeDetected: 'EXPEDIENTE_COMPLETO',
                    confidenceSummary:
                      'The document is mostly legible, but there are inconsistencies in personal data and employment history. Multiple addresses are present, and the sex on the INE mismatches other documents. Employment start date and daily base salary are not clearly defined.',
                    mismatchHints: ['Multiple addresses are present.'],
                    observations: ['The document is mostly legible.'],
                  }),
                },
              ],
            },
          },
        ],
      }),
    }) as Response) as typeof fetch

  const result = await extractDocumentWithGemini({
    apiKey: 'secret',
    buffer: Buffer.from('fake'),
    mimeType: 'application/pdf',
    fileName: 'expediente.pdf',
    expectedDocumentType: 'EXPEDIENTE_COMPLETO',
    employeeName: 'Ana',
    fetchImpl: fetchMock,
  })

  expect(result.confidenceSummary).toBe(
    'El documento es mayormente legible, pero hay inconsistencias en los datos personales y en el historial laboral. Hay multiples domicilios y el sexo que aparece en la INE no coincide con otros documentos. La fecha de ingreso y el SBC diario no estan claramente definidos.'
  )
  expect(result.mismatchHints).toEqual(['Hay multiples domicilios en el expediente.'])
  expect(result.observations).toEqual(['El documento es mayormente legible.'])
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
