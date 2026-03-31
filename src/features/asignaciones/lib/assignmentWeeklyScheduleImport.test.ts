import { expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import { parseAssignmentWeeklyScheduleWorkbook } from './assignmentWeeklyScheduleImport'

test('parsea horarios semanales San Pablo y deduplica por PDV y fecha especifica', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      SEMANA_INICIO: '2026-03-30',
      'BTL CVE': 'BTL-SPB-001',
      DIA: 'LUN',
      CODIGO_TURNO: 'TC',
      OBSERVACIONES: 'Turno de catalogo',
    },
    {
      SEMANA_INICIO: '2026-03-30',
      'BTL CVE': 'BTL-SPB-001',
      DIA: 'LUN',
      CODIGO_TURNO: 'TC',
      OBSERVACIONES: 'Duplicada',
    },
    {
      SEMANA_INICIO: '2026-03-30',
      'BTL CVE': 'BTL-SPB-002',
      DIA: 'VIE',
      HORA_ENTRADA: '12:00',
      HORA_SALIDA: '20:00',
    },
    {
      SEMANA_INICIO: '',
      'BTL CVE': 'BTL-SPB-003',
      DIA: 'MAR',
      HORA_ENTRADA: '11:00',
      HORA_SALIDA: '19:00',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Horarios')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseAssignmentWeeklyScheduleWorkbook(buffer)

  expect(result.skippedRows).toBe(2)
  expect(result.rows).toEqual([
    {
      rowNumber: 3,
      semanaInicio: '2026-03-30',
      claveBtl: 'BTL-SPB-001',
      diaSemana: 1,
      diaLabel: 'LUN',
      fechaEspecifica: '2026-03-30',
      codigoTurno: 'TC',
      horaEntrada: null,
      horaSalida: null,
      observaciones: 'Duplicada',
    },
    {
      rowNumber: 4,
      semanaInicio: '2026-03-30',
      claveBtl: 'BTL-SPB-002',
      diaSemana: 5,
      diaLabel: 'VIE',
      fechaEspecifica: '2026-04-03',
      codigoTurno: null,
      horaEntrada: '12:00',
      horaSalida: '20:00',
      observaciones: null,
    },
  ])
})
