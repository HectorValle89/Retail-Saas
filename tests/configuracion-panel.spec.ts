import { expect, test } from '@playwright/test'
import { obtenerPanelConfiguracion } from '../src/features/configuracion/services/configuracionService'
import {
  OCR_MODEL_CONFIG_KEY,
  OCR_PROVIDER_CONFIG_KEY,
  TURNOS_CONFIG_KEY,
} from '../src/features/configuracion/configuracionCatalog'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createFakeConfiguracionSupabase(results: Record<string, QueryResult>) {
  const expectedOrderCalls: Record<string, number> = {
    configuracion: 2,
    producto: 1,
    cadena: 1,
    ciudad: 1,
    mision_dia: 2,
  }

  return {
    from(table: string) {
      let orderCalls = 0

      return {
        select() {
          return this
        },
        order() {
          orderCalls += 1

          if (orderCalls >= (expectedOrderCalls[table] ?? 1)) {
            return Promise.resolve(results[table])
          }

          return this
        },
      }
    },
  }
}

test('consolida catalogos, parametros y OCR centralizado para configuracion', async () => {
  const previousProvider = process.env.OCR_PROVIDER
  const previousKey = process.env.GEMINI_API_KEY

  delete process.env.OCR_PROVIDER
  process.env.GEMINI_API_KEY = 'secret'

  try {
    const client = createFakeConfiguracionSupabase({
      configuracion: {
        data: [
          {
            id: 'cfg-radio',
            clave: 'geocerca.radio_default_metros',
            valor: 150,
            descripcion: 'Radio base',
            modulo: 'asistencias',
          },
          {
            id: 'cfg-turnos',
            clave: TURNOS_CONFIG_KEY,
            valor: {
              turnos: [
                {
                  nomenclatura: 'SP_9_18',
                  turno: 'Base semanal',
                  horario: '09:00 a 18:00',
                  hora_entrada: '09:00:00',
                  hora_salida: '18:00:00',
                },
              ],
            },
            descripcion: 'Catalogo de turnos',
            modulo: 'asistencias',
          },
          {
            id: 'cfg-ocr-provider',
            clave: OCR_PROVIDER_CONFIG_KEY,
            valor: 'gemini',
            descripcion: 'Proveedor OCR',
            modulo: 'integraciones',
          },
          {
            id: 'cfg-ocr-model',
            clave: OCR_MODEL_CONFIG_KEY,
            valor: 'gemini-2.5-flash',
            descripcion: 'Modelo OCR',
            modulo: 'integraciones',
          },
          {
            id: 'cfg-selfies',
            clave: 'archivos.retencion.selfies_dias',
            valor: 120,
            descripcion: 'Retencion selfies',
            modulo: 'storage',
          },
        ],
        error: null,
      },
      producto: {
        data: [
          {
            id: 'prod-1',
            sku: 'ISD-001',
            nombre: 'Fotoprotector Fusion Water',
            nombre_corto: 'Fusion Water',
            categoria: 'Solares',
            top_30: true,
            activo: true,
          },
          {
            id: 'prod-2',
            sku: 'ISD-002',
            nombre: 'Acniben Gel',
            nombre_corto: 'Acniben',
            categoria: 'Acne',
            top_30: false,
            activo: false,
          },
        ],
        error: null,
      },
      cadena: {
        data: [
          {
            id: 'cad-1',
            codigo: 'SAN_PABLO',
            nombre: 'San Pablo',
            factor_cuota_default: 1.15,
            activa: true,
          },
        ],
        error: null,
      },
      ciudad: {
        data: [
          {
            id: 'ciudad-1',
            nombre: 'MONTERREY',
            zona: 'NORTE',
            activa: true,
          },
          {
            id: 'ciudad-2',
            nombre: 'PUEBLA',
            zona: 'CENTRO',
            activa: false,
          },
        ],
        error: null,
      },
      mision_dia: {
        data: [
          {
            id: 'mision-1',
            codigo: 'M0001',
            instruccion: 'Solicitar evidencia fisica.',
            orden: 1,
            peso: 2,
            activa: true,
          },
          {
            id: 'mision-2',
            codigo: 'M0002',
            instruccion: 'Validar exhibidor completo.',
            orden: 2,
            peso: 1,
            activa: false,
          },
        ],
        error: null,
      },
    })

    const data = await obtenerPanelConfiguracion(client as never)

    expect(data.infraestructuraLista).toBe(true)
    expect(data.resumen).toMatchObject({
      productosActivos: 1,
      cadenasActivas: 1,
      ciudadesActivas: 1,
      turnosCatalogo: 1,
      misionesActivas: 1,
      parametrosConfigurados: 2,
    })
    expect(data.turnos[0]).toMatchObject({
      nomenclatura: 'SP_9_18',
      horaEntrada: '09:00:00',
      horaSalida: '18:00:00',
    })
    expect(data.parametrosGlobales[0]).toMatchObject({
      key: 'geocerca.radio_default_metros',
      value: '150',
      persisted: true,
    })
    expect(
      data.parametrosGlobales.find((item) => item.key === 'biometria.umbral_similitud')
    ).toMatchObject({
      value: '0.82',
      persisted: false,
    })
    expect(data.ocr).toMatchObject({
      source: 'CONFIGURACION',
      effectiveProvider: 'gemini',
      effectiveModel: 'gemini-2.5-flash',
      status: 'LISTO',
      available: true,
    })
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

test('marca infraestructura parcial cuando falta alguna tabla base de configuracion', async () => {
  const client = createFakeConfiguracionSupabase({
    configuracion: {
      data: null,
      error: { message: 'relation public.configuracion does not exist' },
    },
    producto: {
      data: [],
      error: null,
    },
    cadena: {
      data: [],
      error: null,
    },
    ciudad: {
      data: [],
      error: null,
    },
    mision_dia: {
      data: [],
      error: null,
    },
  })

  const data = await obtenerPanelConfiguracion(client as never)

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('relation public.configuracion does not exist')
  expect(data.turnos).toHaveLength(0)
  expect(data.parametrosGlobales[0]).toMatchObject({
    key: 'geocerca.radio_default_metros',
    value: '100',
    persisted: false,
  })
  expect(data.ocr.status).toBe('DESHABILITADO')
})
