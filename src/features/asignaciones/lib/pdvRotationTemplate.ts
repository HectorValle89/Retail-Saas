import * as XLSX from 'xlsx'

const TEMPLATE_SHEET_NAME = 'Rotacion_Maestra'
const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'
const TEMPLATE_FILENAME = 'isdin_plantilla_rotacion_maestra_pdvs.xlsx'
const PROPOSAL_FILENAME = 'isdin_propuesta_rotacion_maestra_pdvs.xlsx'

export interface PdvRotationTemplateRow {
  claveBtl: string
  nombrePdv: string | null
  estatusPdv: string | null
  clasificacionMaestra: string | null
  grupoRotacion: string | null
  tamanoGrupo: number | null
  posicion: string | null
  pdvRelacionado1: string | null
  pdvRelacionado2: string | null
  referenciaDcActual: string | null
  observaciones: string | null
}

const TEMPLATE_HEADERS = [
  'BTL CVE',
  'NOMBRE PDV',
  'ESTATUS PDV',
  'CLASIFICACION MAESTRA',
  'GRUPO ROTACION',
  'TAMANO GRUPO',
  'POSICION',
  'PDV RELACIONADO 1',
  'PDV RELACIONADO 2',
  'REFERENCIA DC ACTUAL',
  'OBSERVACIONES',
] as const

const SAMPLE_FIXED_ROW = [
  'BTL-FAH-50SU-ME',
  'Farmacias del Ahorro 50 Sur',
  'ACTIVO',
  'FIJO',
  '',
  '',
  '',
  '',
  '',
  'ANA PATRICIA ORTEGA RAMIREZ',
  'PDV fijo del catalogo maestro.',
]

const SAMPLE_ROTATIVE_ROW = [
  'BTL-SPB-CUMBRES-MTY',
  'San Pablo Cumbres',
  'ACTIVO',
  'ROTATIVO',
  'ROT-ISDIN-001',
  2,
  'A',
  'BTL-SPB-VALLE-MTY',
  '',
  'CARMELITA SANCHEZ MARQUEZ',
  'Pareja rotativa del bloque noreste.',
]

function buildInstructionRows() {
  return [
    ['Plantilla oficial ISDIN - Rotacion maestra de PDVs'],
    [''],
    ['Objetivo'],
    ['1.', 'Define la topologia maestra de PDVs FIJOS y ROTATIVOS para la cuenta.'],
    ['2.', 'Esta capa no reemplaza asignaciones ni cobertura diaria; solo modela la relacion estructural entre PDVs.'],
    ['3.', 'La importacion se procesa como reemplazo total de la rotacion maestra de la cuenta.'],
    [''],
    ['Columnas reconocidas'],
    ['BTL CVE', 'Obligatoria. Clave BTL del PDV.'],
    ['NOMBRE PDV', 'Opcional de referencia visual.'],
    ['ESTATUS PDV', 'Opcional. Sirve solo para revision.'],
    ['CLASIFICACION MAESTRA', 'Obligatoria en el archivo final. Valores validos: FIJO o ROTATIVO.'],
    ['GRUPO ROTACION', 'Obligatoria cuando el PDV es ROTATIVO. Ejemplo: ROT-ISDIN-001.'],
    ['TAMANO GRUPO', 'Obligatoria para ROTATIVO. Solo 2 o 3.'],
    ['POSICION', 'Obligatoria para ROTATIVO. Solo A, B o C.'],
    ['PDV RELACIONADO 1', 'Opcional de referencia. Clave BTL del PDV hermano.'],
    ['PDV RELACIONADO 2', 'Opcional de referencia. Solo aplica para grupos de 3.'],
    ['REFERENCIA DC ACTUAL', 'Opcional. Ayuda a revisar si la sugerencia coincide con la operacion actual.'],
    ['OBSERVACIONES', 'Opcional. Notas de revision humana.'],
    [''],
    ['Reglas importantes'],
    ['1.', 'Cada PDV operable debe aparecer exactamente una vez en el archivo final.'],
    ['2.', 'Un PDV FIJO no debe tener grupo, tamano ni posicion.'],
    ['3.', 'Un PDV ROTATIVO debe tener grupo, tamano y posicion.'],
    ['4.', 'Los grupos de 2 deben cerrar con A y B; los de 3 deben cerrar con A, B y C.'],
    ['5.', 'No uses PDVs INACTIVOS dentro de grupos rotativos.'],
    ['6.', 'La propuesta descargable puede traer celdas en blanco para casos pendientes de revision. Antes de importar, todos los PDVs operables deben quedar definidos.'],
  ]
}

function toSheetRows(rows: PdvRotationTemplateRow[]) {
  return rows.map((row) => ({
    'BTL CVE': row.claveBtl,
    'NOMBRE PDV': row.nombrePdv ?? '',
    'ESTATUS PDV': row.estatusPdv ?? '',
    'CLASIFICACION MAESTRA': row.clasificacionMaestra ?? '',
    'GRUPO ROTACION': row.grupoRotacion ?? '',
    'TAMANO GRUPO': row.tamanoGrupo ?? '',
    POSICION: row.posicion ?? '',
    'PDV RELACIONADO 1': row.pdvRelacionado1 ?? '',
    'PDV RELACIONADO 2': row.pdvRelacionado2 ?? '',
    'REFERENCIA DC ACTUAL': row.referenciaDcActual ?? '',
    OBSERVACIONES: row.observaciones ?? '',
  }))
}

function buildWorkbook(rows: PdvRotationTemplateRow[]) {
  const workbook = XLSX.utils.book_new()
  const effectiveRows = rows.length > 0 ? rows : [
    {
      claveBtl: String(SAMPLE_FIXED_ROW[0]),
      nombrePdv: String(SAMPLE_FIXED_ROW[1]),
      estatusPdv: String(SAMPLE_FIXED_ROW[2]),
      clasificacionMaestra: String(SAMPLE_FIXED_ROW[3]),
      grupoRotacion: null,
      tamanoGrupo: null,
      posicion: null,
      pdvRelacionado1: null,
      pdvRelacionado2: null,
      referenciaDcActual: String(SAMPLE_FIXED_ROW[9]),
      observaciones: String(SAMPLE_FIXED_ROW[10]),
    },
    {
      claveBtl: String(SAMPLE_ROTATIVE_ROW[0]),
      nombrePdv: String(SAMPLE_ROTATIVE_ROW[1]),
      estatusPdv: String(SAMPLE_ROTATIVE_ROW[2]),
      clasificacionMaestra: String(SAMPLE_ROTATIVE_ROW[3]),
      grupoRotacion: String(SAMPLE_ROTATIVE_ROW[4]),
      tamanoGrupo: Number(SAMPLE_ROTATIVE_ROW[5]),
      posicion: String(SAMPLE_ROTATIVE_ROW[6]),
      pdvRelacionado1: String(SAMPLE_ROTATIVE_ROW[7]),
      pdvRelacionado2: null,
      referenciaDcActual: String(SAMPLE_ROTATIVE_ROW[9]),
      observaciones: String(SAMPLE_ROTATIVE_ROW[10]),
    },
  ]

  const templateSheet = XLSX.utils.json_to_sheet(toSheetRows(effectiveRows), {
    header: [...TEMPLATE_HEADERS],
  })

  templateSheet['!cols'] = [
    { wch: 20 },
    { wch: 34 },
    { wch: 14 },
    { wch: 24 },
    { wch: 20 },
    { wch: 16 },
    { wch: 12 },
    { wch: 20 },
    { wch: 20 },
    { wch: 30 },
    { wch: 54 },
  ]

  const instructionsSheet = XLSX.utils.aoa_to_sheet(buildInstructionRows())
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 120 }]

  XLSX.utils.book_append_sheet(workbook, templateSheet, TEMPLATE_SHEET_NAME)
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, INSTRUCTIONS_SHEET_NAME)

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buffer)
}

export function buildPdvRotationTemplateWorkbook() {
  return buildWorkbook([])
}

export function buildPdvRotationProposalWorkbook(rows: PdvRotationTemplateRow[]) {
  return buildWorkbook(rows)
}

export function getPdvRotationTemplateFilename() {
  return TEMPLATE_FILENAME
}

export function getPdvRotationProposalFilename() {
  return PROPOSAL_FILENAME
}