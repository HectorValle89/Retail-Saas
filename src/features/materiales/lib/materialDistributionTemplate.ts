import * as XLSX from 'xlsx'

const TEMPLATE_SHEET_NAME = 'Bloque_ISDIN'
const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'
const TEMPLATE_FILENAME = 'isdin_plantilla_dispersion_materiales.xlsx'

const TEMPLATE_HEADERS = [
  'ID BTL',
  'CADENA',
  'ID',
  'SUCURSAL',
  'NOMBRE DC',
  'ID NÓMINA',
  'TERRITORIO',
  'PRODUCTO 1',
  'PRODUCTO 2',
  'PRODUCTO 3',
  'PRODUCTO 4',
] as const

const PRESET_ROW = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'CANJE || Escribe aquí la mecánica heredada del canje',
  'TESTER || Escribe aquí la instrucción de mercadeo',
  'DOSIS || Observación operativa del material',
  'REGALO_DC || Obsequio para dermoconsejera',
]

const TOTALS_ROW = ['', '', '', '', '', '', '', 0, 0, 0, 0]

const BLANK_ROW = Array.from({ length: TEMPLATE_HEADERS.length }, () => '')

function buildInstructionRows() {
  return [
    ['Plantilla oficial ISDIN - Dispersión mensual por bloque'],
    [''],
    ['Estructura obligatoria del archivo'],
    ['Fila 1', 'Preset + mecánica / instrucción heredada por producto'],
    ['Fila 2', 'Totales por producto del bloque'],
    ['Fila 3', 'Encabezados homologados'],
    ['Fila 4 en adelante', 'Registros por PDV'],
    [''],
    ['Columnas base obligatorias'],
    [[...TEMPLATE_HEADERS.slice(0, 7)].join(' | ')],
    [''],
    ['Presets válidos'],
    ['CANJE', 'Hereda la mecánica de canje a todos los PDVs con cantidad mayor a cero'],
    ['TESTER', 'Se recibe formalmente, no entra a entrega al shopper y puede requerir mercadeo'],
    ['DOSIS', 'Se recibe formalmente, no entra a entrega al shopper'],
    ['REGALO_DC', 'Se recibe formalmente como obsequio para la dermoconsejera'],
    [''],
    ['Regla de vacante'],
    [
      'Si ID NÓMINA viene vacío, el PDV se trata como vacante y la dispersión se entrega cuando exista una dermoconsejera con asignación viva en ese PDV.',
    ],
    [''],
    ['Notas operativas'],
    ['El amarre del PDV se hace por ID BTL contra la clave BTL del sistema.'],
    ['Si TERRITORIO viene vacío, el sistema intenta heredarlo desde el PDV.'],
    ['Las columnas desde PRODUCTO 1 en adelante representan materiales del bloque.'],
  ]
}

export function buildMaterialDistributionTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()

  const templateSheet = XLSX.utils.aoa_to_sheet([
    PRESET_ROW,
    TOTALS_ROW,
    [...TEMPLATE_HEADERS],
    [...BLANK_ROW],
    [...BLANK_ROW],
  ])

  templateSheet['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 26 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
  ]

  const instructionsSheet = XLSX.utils.aoa_to_sheet(buildInstructionRows())
  instructionsSheet['!cols'] = [{ wch: 24 }, { wch: 120 }]

  XLSX.utils.book_append_sheet(workbook, templateSheet, TEMPLATE_SHEET_NAME)
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, INSTRUCTIONS_SHEET_NAME)

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buffer)
}

export function getMaterialDistributionTemplateFilename() {
  return TEMPLATE_FILENAME
}

