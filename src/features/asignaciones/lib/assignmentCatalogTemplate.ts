import * as XLSX from 'xlsx'

const TEMPLATE_SHEET_NAME = 'Catalogo_Maestro'
const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'
const TEMPLATE_FILENAME = 'isdin_plantilla_catalogo_maestro_asignaciones.xlsx'

const TEMPLATE_HEADERS = [
  'BTL CVE',
  'IDNOM',
  'USUARIO',
  'NOMBRE DC',
  '# DC',
  'ROL',
  'HORARIO',
  'DÍAS',
  'DESCANSO',
  'OBSERVACIONES',
] as const

const SAMPLE_FIXED_ROW = [
  'BTL-FAH-50SU-ME',
  '594',
  'btl-dc-1239',
  'ANA PATRICIA ORTEGA RAMIREZ',
  '1',
  'FIJA',
  '11:00 a 19:00',
  'L-M-X-J-V-S',
  'DOM',
  'Asignacion base mensual en sucursal principal.',
]

const SAMPLE_ROTATIVE_ROW = [
  'BTL-SPB-CUMBRES-MTY',
  '542',
  'btl-dc-1187',
  'CARMELITA SANCHEZ MARQUEZ',
  '0.5',
  'ROTATIVA',
  '12:00 a 20:00',
  'L-X-V-S',
  'MAR',
  'Cobertura parcial por rotacion del bloque.',
]

function buildInstructionRows() {
  return [
    ['Plantilla oficial ISDIN - Catálogo maestro de asignaciones'],
    [''],
    ['Qué hace esta carga'],
    ['1.', 'Puebla o actualiza la base viva inicial de asignaciones del mes.'],
    ['2.', 'Se usa para la importacion del catalogo maestro; despues la operacion diaria debe continuar con movimientos puntuales y cambios controlados.'],
    [''],
    ['Columnas reconocidas por el importador'],
    ['BTL CVE', 'Obligatoria. Clave BTL del PDV tal como existe en el sistema.'],
    ['IDNOM', 'Recomendada. Nómina de la dermoconsejera.'],
    ['USUARIO', 'Opcional. Username provisional o final de la dermoconsejera si no usas nómina.'],
    ['NOMBRE DC', 'Opcional. Nombre completo de la dermoconsejera si no usas nómina ni usuario.'],
    ['# DC', 'Opcional de referencia. El parser lo acepta, pero la importacion actual ya no usa este valor como captura manual operativa del factor tiempo.'],
    ['ROL', 'Opcional. Valores recomendados: FIJA, ROTATIVA o COBERTURA.'],
    ['HORARIO', 'Opcional. Texto de referencia del turno esperado para esa asignacion.'],
    ['DÍAS', 'Opcional. Dias laborales. Se aceptan nombres completos, codigos clasicos o nomenclatura compacta como L-M-X-J-V, LUN-SAB o JUE-MAR.'],
    ['DESCANSO', 'Opcional. Día de descanso semanal, por ejemplo DOM.'],
    ['OBSERVACIONES', 'Opcional. Notas de cobertura, adopción, bloque o contexto operativo.'],
    [''],
    ['Reglas importantes'],
    ['1.', 'Cada fila debe resolver un PDV existente por BTL CVE.'],
    ['2.', 'Cada fila debe resolver a la dermoconsejera por IDNOM, USUARIO o NOMBRE DC.'],
    ['3.', 'Si no se resuelve PDV o DC, la fila se omite y se reporta al final de la importacion.'],
    ['4.', 'El catalogo maestro inicial se trata como base general. El sistema asigna fecha de inicio al dia de la carga y deja la base sin fecha fin.'],
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
    { wch: 14 },
    { wch: 16 },
    { wch: 34 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
    { wch: 48 },
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
