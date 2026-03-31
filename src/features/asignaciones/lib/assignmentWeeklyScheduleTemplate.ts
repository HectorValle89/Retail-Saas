import * as XLSX from 'xlsx'

const TEMPLATE_SHEET_NAME = 'Horarios_San_Pablo'
const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'
const TEMPLATE_FILENAME = 'isdin_plantilla_horarios_san_pablo_semanal.xlsx'

const TEMPLATE_HEADERS = [
  'SEMANA_INICIO',
  'BTL CVE',
  'DIA',
  'CODIGO_TURNO',
  'HORA_ENTRADA',
  'HORA_SALIDA',
  'OBSERVACIONES',
] as const

const SAMPLE_ROW_MONDAY = [
  '2026-03-30',
  'BTL-SPB-CUMBRES-MTY',
  'LUN',
  'TC',
  '',
  '',
  'Turno heredado desde catalogo San Pablo.',
]

const SAMPLE_ROW_FRIDAY = [
  '2026-03-30',
  'BTL-SPB-CUMBRES-MTY',
  'VIE',
  '',
  '12:00',
  '20:00',
  'Horario especial del viernes para esta semana.',
]

function buildInstructionRows() {
  return [
    ['Plantilla oficial ISDIN - Horarios semanales San Pablo'],
    [''],
    ['Qué hace esta carga'],
    ['1.', 'Carga horarios semanales por PDV para la cadena San Pablo reutilizando horario_pdv.'],
    ['2.', 'Cada fila representa el horario efectivo de un PDV en un dia especifico de la semana.'],
    ['3.', 'La semana se toma a partir de la fecha lunes en SEMANA_INICIO.'],
    [''],
    ['Columnas reconocidas por el importador'],
    ['SEMANA_INICIO', 'Obligatoria. Fecha lunes de la semana que se va a cargar. Formato recomendado: YYYY-MM-DD.'],
    ['BTL CVE', 'Obligatoria. Clave BTL del PDV tal como existe en el sistema.'],
    ['DIA', 'Obligatoria. Valores recomendados: LUN, MAR, MIE, JUE, VIE, SAB o DOM.'],
    ['CODIGO_TURNO', 'Opcional. Nomenclatura del catalogo de turnos San Pablo. Si se informa y no mandas horas, el sistema resuelve la hora desde configuracion.'],
    ['HORA_ENTRADA', 'Opcional si ya informaste CODIGO_TURNO. Formato HH:MM.'],
    ['HORA_SALIDA', 'Opcional si ya informaste CODIGO_TURNO. Formato HH:MM.'],
    ['OBSERVACIONES', 'Opcional. Nota semanal o excepcion operativa.'],
    [''],
    ['Reglas importantes'],
    ['1.', 'El sistema solo acepta PDVs de la cadena San Pablo en esta carga.'],
    ['2.', 'La carga semanal crea horarios por fecha especifica para la semana informada.'],
    ['3.', 'Si ya existia un horario especifico para el mismo PDV y fecha, se reemplaza por la nueva carga.'],
    ['4.', 'Si CODIGO_TURNO no puede resolver horas, debes informar HORA_ENTRADA y HORA_SALIDA.'],
    ['5.', 'El formato soportado por la carga actual es XLSX.'],
  ]
}

export function buildAssignmentWeeklyScheduleTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()

  const templateSheet = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS],
    SAMPLE_ROW_MONDAY,
    SAMPLE_ROW_FRIDAY,
  ])

  templateSheet['!cols'] = [
    { wch: 16 },
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 48 },
  ]

  const instructionsSheet = XLSX.utils.aoa_to_sheet(buildInstructionRows())
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 120 }]

  XLSX.utils.book_append_sheet(workbook, templateSheet, TEMPLATE_SHEET_NAME)
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, INSTRUCTIONS_SHEET_NAME)

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buffer)
}

export function getAssignmentWeeklyScheduleTemplateFilename() {
  return TEMPLATE_FILENAME
}
