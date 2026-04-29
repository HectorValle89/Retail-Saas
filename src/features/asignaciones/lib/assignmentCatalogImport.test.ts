import { expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import { parseAssignmentCatalogWorkbook } from './assignmentCatalogImport'
import { buildAssignmentCatalogTemplateWorkbook } from './assignmentCatalogTemplate'
import { parseDiasLaborales } from './assignmentPlanning'

test('la plantilla oficial del catalogo maestro expone solo los encabezados esperados', () => {
  const workbook = XLSX.read(buildAssignmentCatalogTemplateWorkbook(), { type: 'buffer', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]

  expect(rows[0]).toEqual([
    'BTL CVE',
    'USUARIO',
    'IDNOM',
    'NOMBRE DC',
    'HORARIO',
    'DÍAS laborales',
    'DESCANSO',
    'fecha de inicio',
  ])
})

test('parsea el catalogo maestro inicial de asignaciones y deduplica filas repetidas', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'BTL CVE': 'BTL-001',
      USUARIO: 'ana_ortega',
      IDNOM: '439',
      'NOMBRE DC': 'ANA PATRICIA ORTEGA RAMIREZ',
      HORARIO: '09:00 - 18:00',
      'DÍAS laborales': 'Lunes, Martes, Miercoles, Jueves, Viernes',
      DESCANSO: 'Sabado',
      'fecha de inicio': '2026-04-01',
    },
    {
      'BTL CVE': 'BTL-001',
      USUARIO: 'ana_ortega',
      IDNOM: '439',
      'NOMBRE DC': 'ANA PATRICIA ORTEGA RAMIREZ',
      HORARIO: '09:00 - 18:00',
      'DÍAS laborales': 'Lunes, Martes, Miercoles, Jueves, Viernes',
      DESCANSO: 'Sabado',
      'fecha de inicio': '2026-04-02',
    },
    {
      'BTL CVE': 'BTL-002',
      USUARIO: 'dc_noreste_01',
      IDNOM: '540',
      'NOMBRE DC': 'MARIA FERNANDA LOPEZ',
      HORARIO: '10:00 - 18:00',
      'DÍAS laborales': 'LUN VIE',
      DESCANSO: 'DOM',
      'fecha de inicio': '2026-04-10',
    },
    {
      'BTL CVE': '',
      IDNOM: '999',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseAssignmentCatalogWorkbook(buffer)

  expect(result.skippedRows).toBe(2)
  expect(result.issues.map((item) => item.code)).toEqual(['FILA_DUPLICADA', 'FILA_SIN_BTL'])
  expect(result.rows).toEqual([
    {
      rowNumber: 3,
      claveBtl: 'BTL-001',
      empleadoId: null,
      idNomina: '439',
      username: 'ana_ortega',
      nombreDc: 'ANA PATRICIA ORTEGA RAMIREZ',
      tipo: 'FIJA',
      factorTiempo: 1,
      diasLaborales: 'LUN,MAR,MIE,JUE,VIE',
      diaDescanso: 'SAB',
      horarioReferencia: '09:00 - 18:00',
      fechaInicio: '2026-04-02',
      observaciones: null,
    },
    {
      rowNumber: 4,
      claveBtl: 'BTL-002',
      empleadoId: null,
      idNomina: '540',
      username: 'dc_noreste_01',
      nombreDc: 'MARIA FERNANDA LOPEZ',
      tipo: 'FIJA',
      factorTiempo: 1,
      diasLaborales: 'LUN,VIE',
      diaDescanso: 'DOM',
      horarioReferencia: '10:00 - 18:00',
      fechaInicio: '2026-04-10',
      observaciones: null,
    },
  ])
})

test('acepta la nomenclatura compacta y rangos envolventes para dias laborales', () => {
  expect(parseDiasLaborales('L-M-X-J-V-S').dias).toEqual(['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'])
  expect(parseDiasLaborales('JUE-MAR').dias).toEqual(['LUN', 'MAR', 'JUE', 'VIE', 'SAB', 'DOM'])
  expect(parseDiasLaborales('LUN-MIER-VIER').dias).toEqual(['LUN', 'MIE', 'VIE'])
  expect(parseDiasLaborales('M-J-S').dias).toEqual(['MAR', 'JUE', 'SAB'])
})

test('prioriza empleado_id para deduplicar filas aunque existan aliases legacy', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'BTL CVE': 'BTL-777',
      EMPLEADO_ID: 'emp-777',
      USUARIO: 'dc_alias_uno',
      IDNOM: 'LEG-1',
    },
    {
      CLAVE_BTL: 'BTL-777',
      EMPLEADO_ID: 'emp-777',
      USUARIO: 'dc_alias_dos',
      IDNOM: 'LEG-2',
      OBSERVACIONES: 'Ultima captura',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseAssignmentCatalogWorkbook(buffer)

  expect(result.skippedRows).toBe(1)
  expect(result.issues.map((item) => item.code)).toEqual(['FILA_DUPLICADA'])
  expect(result.rows[0]).toMatchObject({
    claveBtl: 'BTL-777',
    empleadoId: 'emp-777',
    username: 'dc_alias_dos',
    idNomina: 'LEG-2',
    observaciones: 'Ultima captura',
  })
})

test('reporta dias y descansos invalidos del catalogo maestro', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'BTL CVE': 'BTL-003',
      IDNOM: '501',
      'DÍAS laborales': 'L-Q-Z',
      DESCANSO: 'Q',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseAssignmentCatalogWorkbook(buffer)

  expect(result.issues.map((item) => item.code)).toEqual([
    'DIAS_LABORALES_INVALIDOS',
    'DESCANSO_INVALIDO',
  ])
})
