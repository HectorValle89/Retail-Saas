// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')

const TEMPLATE_SHEET_NAME = 'Catalogo_Maestro'
const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'
const TEMPLATE_FILENAME = 'isdin_plantilla_catalogo_maestro_asignaciones.xlsx'

const TEMPLATE_HEADERS = [
  'BTL CVE',
  'USUARIO',
  'IDNOM',
  'NOMBRE DC',
  'HORARIO',
  'DÍAS laborales',
  'DESCANSO',
  'fecha de inicio',
] as const

const SAMPLE_FIXED_ROW = [
  'BTL-FAH-50SU-ME',
  'ana_ortega',
  '594',
  'ANA PATRICIA ORTEGA RAMIREZ',
  '11:00 a 19:00',
  'L-M-X-J-V-S',
  'DOM',
  '2026-04-01',
]

const SAMPLE_ROTATIVE_ROW = [
  'BTL-SPB-CUMBRES-MTY',
  'carmelita_sanchez',
  '542',
  'CARMELITA SANCHEZ MARQUEZ',
  '12:00 a 20:00',
  'L-X-V-S',
  'MAR',
  '2026-04-15',
]

function buildInstructionRows() {
  return [
    ['Plantilla oficial ISDIN - Catálogo maestro de asignaciones'],
    [''],
    ['Qué hace esta carga'],
    ['1.', 'Puebla o actualiza la base viva inicial de asignaciones del mes.'],
    ['2.', 'Se usa para la importacion del catalogo maestro; despues la operacion diaria debe continuar con movimientos puntuales y cambios controlados.'],
    [''],
    ['Columnas de la plantilla oficial'],
    ['BTL CVE', 'Obligatoria. Clave BTL del PDV tal como existe en el sistema.'],
    ['USUARIO', 'Campo de referencia de la plantilla oficial. El importador también puede resolver por NOMBRE DC, IDNOM o EMPLEADO_ID legacy si hace falta.'],
    ['IDNOM', 'Campo de referencia de la plantilla oficial. Mantiene compatibilidad con alias legacy de nómina.'],
    ['NOMBRE DC', 'Campo de referencia de la plantilla oficial. Nombre completo exacto de la dermoconsejera.'],
    ['HORARIO', 'Campo de referencia de la plantilla oficial. Texto del turno esperado para esa asignacion.'],
    ['DÍAS laborales', 'Campo de referencia de la plantilla oficial. Se aceptan nombres completos, codigos clasicos o nomenclatura compacta como L-M-X-J-V, LUN-SAB o JUE-MAR.'],
    ['DESCANSO', 'Campo de referencia de la plantilla oficial. Día de descanso semanal, por ejemplo DOM.'],
    ['fecha de inicio', 'Inclúyela siempre. Si viene vacía, el importador usará la fecha de carga como inicio.'],
    [''],
    ['Compatibilidad al importar archivos antiguos'],
    ['EMPLEADO_ID', 'Opcional. UUID interno si el archivo fue generado por el sistema.'],
    ['# DC', 'Opcional de referencia. El parser lo acepta para compatibilidad temporal.'],
    ['ROL', 'Opcional. Valores recomendados: FIJA, ROTATIVA o COBERTURA.'],
    ['OBSERVACIONES', 'Opcional. Notas de cobertura, adopción, bloque o contexto operativo.'],
    [''],
    ['Reglas importantes'],
    ['1.', 'Cada fila debe resolver un PDV existente por BTL CVE.'],
    ['2.', 'Cada fila debe resolver a la dermoconsejera por USUARIO, NOMBRE DC, IDNOM o EMPLEADO_ID legacy.'],
    ['3.', 'Si no se resuelve PDV o DC, la fila se omite y se reporta al final de la importacion.'],
    ['4.', 'El catalogo maestro inicial se trata como base general. El sistema usa la fecha de inicio indicada en el archivo y, si viene vacía, cae a la fecha de carga.'],
    ['5.', 'El archivo puede actualizar asignaciones base existentes o insertar nuevas, segun la coincidencia de DC + PDV + tipo.'],
    ['6.', 'Las vigencias temporales o permanentes posteriores se gestionan desde Nueva asignacion, no desde esta carga inicial.'],
    ['7.', 'El formato soportado por la carga actual es XLSX.'],
    [''],
    ['Formato recomendado de días'],
    ['Ejemplo', 'LUN, MAR, MIE, JUE, VIE, SAB'],
    [''],
    ['Formato recomendado de descanso'],
    ['Ejemplo', 'DOM'],
    [''],
    ['Notas de operación'],
    ['Usa una sola hoja principal para el catálogo maestro.'],
    ['No cambies los encabezados de la fila 1.'],
    ['Si una misma DC aparece en varios PDV, usa una fila por asignación.'],
  ]
}

export function buildAssignmentCatalogTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()

  const templateSheet = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS],
    SAMPLE_FIXED_ROW,
    SAMPLE_ROTATIVE_ROW,
  ])

  templateSheet['!cols'] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 34 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
  ]

  const instructionsSheet = XLSX.utils.aoa_to_sheet(buildInstructionRows())
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 120 }]

  XLSX.utils.book_append_sheet(workbook, templateSheet, TEMPLATE_SHEET_NAME)
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, INSTRUCTIONS_SHEET_NAME)

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buffer)
}

export function getAssignmentCatalogTemplateFilename() {
  return TEMPLATE_FILENAME
}
