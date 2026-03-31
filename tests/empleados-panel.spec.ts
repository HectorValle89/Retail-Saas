import { expect, test } from '@playwright/test'
import {
  collectEmpleadosExportPayload,
  obtenerPanelEmpleados,
} from '../src/features/empleados/services/empleadoService'
import { filterEmpleadosListado } from '../src/features/empleados/lib/empleadosFilters'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createFakeEmpleadosSupabase(results: {
  empleado: QueryResult
  usuario: QueryResult
  empleado_documento: QueryResult
  configuracion: QueryResult
}) {
  const signedCalls: string[] = []

  return {
    from(table: 'empleado' | 'usuario' | 'empleado_documento' | 'configuracion') {
      return {
        select() {
          return this
        },
        order() {
          return Promise.resolve(results[table])
        },
        in() {
          return Promise.resolve(results[table])
        },
      }
    },
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl(path: string) {
            signedCalls.push(`${bucket}/${path}`)
            return Promise.resolve({
              data: { signedUrl: `https://signed.local/${bucket}/${path}` },
              error: null,
            })
          },
        }
      },
    },
    getSignedCalls() {
      return signedCalls
    },
  }
}

test('consolida empleados, documentos y filtros auxiliares del panel', async () => {
  const client = createFakeEmpleadosSupabase({
    empleado: {
      data: [
        {
          id: 'emp-1',
          id_nomina: '1001',
          nombre_completo: 'Ana Supervisor',
          curp: 'AAAA010101MDFLNN01',
          nss: '11111111111',
          rfc: 'AAAA010101AAA',
          puesto: 'SUPERVISOR',
          zona: 'NORTE',
          telefono: '5511111111',
          correo_electronico: 'ana@example.com',
          estatus_laboral: 'ACTIVO',
          fecha_alta: '2026-03-01',
          fecha_nacimiento: '1990-06-15',
          fecha_baja: null,
          domicilio_completo: 'Av. Norte 10, CDMX',
          codigo_postal: '01010',
          edad: 35,
          anios_laborando: 10,
          sexo: 'FEMENINO',
          estado_civil: 'CASADO',
          originario: 'CDMX',
          sbc_diario: 512.34,
          supervisor_empleado_id: null,
          sueldo_base_mensual: 18000,
          expediente_estado: 'VALIDADO',
          expediente_validado_en: '2026-03-10T10:00:00.000Z',
          expediente_observaciones: 'Completo',
          imss_estado: 'ALTA_IMSS',
          imss_fecha_solicitud: '2026-03-02',
          imss_fecha_alta: '2026-03-05',
          imss_observaciones: 'Alta aplicada',
          motivo_baja: null,
          checklist_baja: {},
          metadata: {
            workflow_stage: 'PENDIENTE_ACCESO_ADMIN',
            admin_access_pending: true,
          },
          created_at: '2026-03-01T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
          supervisor: null,
        },
        {
          id: 'emp-2',
          id_nomina: '1002',
          nombre_completo: 'Luis DC',
          curp: 'BBBB010101HDFLNN02',
          nss: '22222222222',
          rfc: 'BBBB010101BBB',
          puesto: 'DERMOCONSEJERO',
          zona: 'SUR',
          telefono: '5522222222',
          correo_electronico: 'luis@example.com',
          estatus_laboral: 'BAJA',
          fecha_alta: '2026-03-01',
          fecha_nacimiento: '2001-01-01',
          fecha_baja: '2026-03-12',
          domicilio_completo: 'Calle Sur 20, Puebla',
          codigo_postal: '72000',
          edad: 25,
          anios_laborando: 2,
          sexo: 'MASCULINO',
          estado_civil: 'SOLTERO',
          originario: 'Puebla',
          sbc_diario: 412.55,
          supervisor_empleado_id: 'emp-1',
          sueldo_base_mensual: 9500,
          expediente_estado: 'EN_REVISION',
          expediente_validado_en: null,
          expediente_observaciones: null,
          imss_estado: 'EN_PROCESO',
          imss_fecha_solicitud: '2026-03-03',
          imss_fecha_alta: null,
          imss_observaciones: 'Pendiente',
          motivo_baja: 'Rotacion',
          checklist_baja: {
            activos_recuperados: true,
          },
          metadata: {
            workflow_stage: 'EN_FLUJO_IMSS',
            admin_access_pending: false,
          },
          created_at: '2026-03-01T11:00:00.000Z',
          updated_at: '2026-03-12T11:00:00.000Z',
          supervisor: {
            id: 'emp-1',
            nombre_completo: 'Ana Supervisor',
          },
        },
      ],
      error: null,
    },
    usuario: {
      data: [
        {
          empleado_id: 'emp-2',
          username: 'luis.dc',
          estado_cuenta: 'PROVISIONAL',
        },
      ],
      error: null,
    },
    empleado_documento: {
      data: [
        {
          id: 'doc-1',
          empleado_id: 'emp-2',
          categoria: 'EXPEDIENTE',
          tipo_documento: 'CURP',
          nombre_archivo_original: 'curp-luis.pdf',
          mime_type: 'application/pdf',
          tamano_bytes: 84500,
          estado_documento: 'CARGADO',
          ocr_provider: null,
          ocr_resultado: {},
          metadata: {
            optimization_kind: 'pdf-rewrite',
            optimization_target_met: true,
            optimization_original_bytes: 245000,
            optimization_final_bytes: 84500,
            optimization_notes: ['object_streams_enabled'],
            optimized_pdf: true,
            optimized_image: false,
          },
          created_at: '2026-03-11T10:00:00.000Z',
          archivo: {
            id: 'hash-1',
            sha256: 'sha-doc-1',
            bucket: 'empleados-expediente',
            ruta_archivo: 'empleados/emp-2/expediente/sha-doc-1.pdf',
          },
        },
      ],
      error: null,
    },
    configuracion: {
      data: [
        {
          clave: 'integraciones.ocr.preferred_provider',
          valor: 'gemini',
        },
        {
          clave: 'integraciones.ocr.preferred_model',
          valor: 'gemini-2.5-flash',
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelEmpleados(client as never)

  expect(data.infraestructuraLista).toBe(true)
  expect(data.resumen).toMatchObject({
    total: 2,
    activos: 1,
    bajas: 1,
    expedienteValidado: 1,
    imssEnProceso: 1,
  })
  expect(data.supervisors).toEqual([
    {
      id: 'emp-1',
      nombreCompleto: 'Ana Supervisor',
    },
  ])
  expect(data.zonas).toEqual(['NORTE', 'SUR'])
  expect(data.pdfOptimizationAvailable).toBe(true)
  expect(data.ocrProvider).toBe('gemini')
  expect(data.recruitingInbox.find((lane) => lane.key === 'en-revision')?.items).toHaveLength(1)
  expect(data.recruitingInbox.find((lane) => lane.key === 'en-revision')?.items[0]?.employeeSummary.nombreCompleto).toBe('Luis DC')
  expect(data.empleados[1]).toMatchObject({
    id: 'emp-2',
    supervisor: 'Ana Supervisor',
    username: 'luis.dc',
    estadoCuenta: 'PROVISIONAL',
    documentosCount: 1,
    motivoBaja: 'Rotacion',
    domicilioCompleto: 'Calle Sur 20, Puebla',
    codigoPostal: '72000',
    edad: 25,
    aniosLaborando: 2,
    sexo: 'MASCULINO',
    estadoCivil: 'SOLTERO',
    originario: 'Puebla',
    sbcDiario: 412.55,
    workflowStage: 'EN_FLUJO_IMSS',
    adminAccessPending: false,
  })
  expect(data.empleados[0]).toMatchObject({
    workflowStage: 'PENDIENTE_ACCESO_ADMIN',
    adminAccessPending: true,
  })
  expect(data.empleados[1].documentos[0]).toMatchObject({
    nombreArchivo: 'curp-luis.pdf',
    sha256: 'sha-doc-1',
    signedUrl:
      'https://signed.local/empleados-expediente/empleados/emp-2/expediente/sha-doc-1.pdf',
    optimization: {
      kind: 'pdf-rewrite',
      optimized: true,
      optimizedPdf: true,
      optimizedImage: false,
      originalBytes: 245000,
      finalBytes: 84500,
      targetMet: true,
      notes: ['object_streams_enabled'],
    },
  })
  expect(client.getSignedCalls()).toEqual([
    'empleados-expediente/empleados/emp-2/expediente/sha-doc-1.pdf',
  ])
})

test('degrada el panel si la tabla empleado no esta disponible', async () => {
  const client = createFakeEmpleadosSupabase({
    empleado: {
      data: null,
      error: { message: 'relation public.empleado does not exist' },
    },
    usuario: {
      data: [],
      error: null,
    },
    empleado_documento: {
      data: [],
      error: null,
    },
    configuracion: {
      data: [],
      error: null,
    },
  })

  const data = await obtenerPanelEmpleados(client as never)

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('relation public.empleado does not exist')
  expect(data.empleados).toHaveLength(0)
  expect(data.resumen.total).toBe(0)
})

test('filtra empleados pendientes de IMSS con el criterio usado por dashboard y deep link', async () => {
  const empleados = [
    {
      id: 'emp-1',
      nombreCompleto: 'Pendiente Uno',
      idNomina: null,
      puesto: 'DERMOCONSEJERO',
      zona: 'NORTE',
      supervisor: null,
      supervisorEmpleadoId: null,
      username: null,
      curp: null,
      rfc: null,
      nss: null,
      correoElectronico: null,
      estatusLaboral: 'ACTIVO',
      expedienteEstado: 'VALIDADO',
      imssEstado: 'NO_INICIADO',
    },
    {
      id: 'emp-2',
      nombreCompleto: 'En Proceso',
      idNomina: null,
      puesto: 'DERMOCONSEJERO',
      zona: 'SUR',
      supervisor: null,
      supervisorEmpleadoId: null,
      username: null,
      curp: null,
      rfc: null,
      nss: null,
      correoElectronico: null,
      estatusLaboral: 'ACTIVO',
      expedienteEstado: 'VALIDADO',
      imssEstado: 'EN_PROCESO',
    },
    {
      id: 'emp-3',
      nombreCompleto: 'Alta Cerrada',
      idNomina: null,
      puesto: 'DERMOCONSEJERO',
      zona: 'SUR',
      supervisor: null,
      supervisorEmpleadoId: null,
      username: null,
      curp: null,
      rfc: null,
      nss: null,
      correoElectronico: null,
      estatusLaboral: 'ACTIVO',
      expedienteEstado: 'VALIDADO',
      imssEstado: 'ALTA_IMSS',
    },
    {
      id: 'emp-4',
      nombreCompleto: 'Expediente No Validado',
      idNomina: null,
      puesto: 'DERMOCONSEJERO',
      zona: 'CENTRO',
      supervisor: null,
      supervisorEmpleadoId: null,
      username: null,
      curp: null,
      rfc: null,
      nss: null,
      correoElectronico: null,
      estatusLaboral: 'ACTIVO',
      expedienteEstado: 'EN_REVISION',
      imssEstado: 'NO_INICIADO',
    },
  ] as never

  const filtrados = filterEmpleadosListado(empleados, {
    search: '',
    estadoLaboral: 'ALL',
    zona: 'ALL',
    supervisorId: 'ALL',
    imss: 'PENDIENTE_IMSS',
  })

  expect(filtrados.map((item) => item.id)).toEqual(['emp-1', 'emp-2'])
})

test('construye exportacion csv de empleados con datos operativos visibles', async () => {
  const client = createFakeEmpleadosSupabase({
    empleado: {
      data: [
        {
          id: 'emp-1',
          id_nomina: '1001',
          nombre_completo: 'Ana Supervisor',
          curp: 'AAAA010101MDFLNN01',
          nss: '11111111111',
          rfc: 'AAAA010101AAA',
          puesto: 'SUPERVISOR',
          zona: 'NORTE',
          telefono: '5511111111',
          correo_electronico: 'ana@example.com',
          estatus_laboral: 'ACTIVO',
          fecha_alta: '2026-03-01',
          fecha_nacimiento: '1990-06-15',
          fecha_baja: null,
          domicilio_completo: 'Av. Norte 10, CDMX',
          codigo_postal: '01010',
          edad: 35,
          anios_laborando: 10,
          sexo: 'FEMENINO',
          estado_civil: 'CASADO',
          originario: 'CDMX',
          sbc_diario: 512.34,
          supervisor_empleado_id: null,
          sueldo_base_mensual: 18000,
          expediente_estado: 'VALIDADO',
          expediente_validado_en: '2026-03-10T10:00:00.000Z',
          expediente_observaciones: 'Completo',
          imss_estado: 'ALTA_IMSS',
          imss_fecha_solicitud: '2026-03-02',
          imss_fecha_alta: '2026-03-05',
          imss_observaciones: 'Alta aplicada',
          motivo_baja: null,
          checklist_baja: {},
          metadata: {
            workflow_stage: 'PENDIENTE_ACCESO_ADMIN',
            admin_access_pending: true,
          },
          created_at: '2026-03-01T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
          supervisor: null,
        },
      ],
      error: null,
    },
    usuario: {
      data: [
        {
          empleado_id: 'emp-1',
          username: 'ana.supervisor',
          estado_cuenta: 'ACTIVA',
        },
      ],
      error: null,
    },
    empleado_documento: {
      data: [],
      error: null,
    },
    configuracion: {
      data: [],
      error: null,
    },
  })

  const payload = await collectEmpleadosExportPayload(client as never)

  expect(payload.headers).toContain('Nombre completo')
  expect(payload.rows).toHaveLength(1)
  expect(payload.rows[0]).toEqual(
    expect.arrayContaining([
      'emp-1',
      '1001',
      'Ana Supervisor',
      'SUPERVISOR',
      'NORTE',
      'ACTIVO',
      'VALIDADO',
      'ALTA_IMSS',
      'ana@example.com',
      'ana.supervisor',
      'SI',
      'PENDIENTE_ACCESO_ADMIN',
    ])
  )
  expect(payload.filenameBase).toMatch(/^empleados-\d{4}-\d{2}-\d{2}$/)
})
