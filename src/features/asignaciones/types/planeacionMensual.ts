export type PlaneacionMensualTipoOperacion =
  | 'ASIGNAR_DC'
  | 'LIBERAR_DC'
  | 'MOVER_DC'
  | 'CAMBIAR_ROTACION'
  | 'CAMBIAR_DESCANSO'
  | 'CAMBIAR_HORARIO'
  | 'CAMBIAR_ESTADO_PDV'
  | 'AGREGAR_EVENTO'
  | 'REASIGNAR_SUPERVISOR';

export type PlaneacionMensualNaturaleza = 'BASE' | 'COBERTURA_TEMPORAL' | 'COBERTURA_PERMANENTE';
export type PlaneacionMensualPdvEstatus = 'ACTIVO' | 'PAUSADO' | 'INACTIVO';

export interface PlaneacionMensualOperacionPayload {
  asignacionId?: string | null;
  naturaleza?: PlaneacionMensualNaturaleza;
  tipo?: 'FIJA' | 'ROTATIVA' | 'COBERTURA';
  factorTiempo?: number;
  diasLaborales?: string | null;
  diaDescanso?: string | null;
  horarioReferencia?: string | null;
  grupoRotacion?: string | null;
  grupoTamano?: 2 | 3 | null;
  slotRotacion?: 'A' | 'B' | 'C' | null;
  estadoPdv?: 'ACTIVO' | 'PAUSADO' | 'INACTIVO';
  fechasDescanso?: string[];
  fechasTrabajo?: string[];
  eventoNombre?: string | null;
  eventoTipo?: 'FORMACION' | 'ISDINIZACION' | 'ACTIVACION' | 'EVENTO_ESPECIAL';
  eventoSede?: string | null;
  eventoModalidad?: 'PRESENCIAL' | 'EN_LINEA';
  supervisorOrigenId?: string | null;
  supervisorDestinoId?: string | null;
}

export interface PlaneacionMensualOperacion {
  tipoOperacion: PlaneacionMensualTipoOperacion;
  empleadoId?: string | null;
  pdvOrigenId?: string | null;
  pdvDestinoId?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  motivo: string;
  payload?: PlaneacionMensualOperacionPayload;
}

export interface PlaneacionMensualIssue {
  code: string;
  operationIndex?: number;
  empleadoId?: string;
  fecha?: string;
  pdvId?: string;
  pdvIds?: string[];
}

export interface PlaneacionMensualPreview {
  ok: boolean;
  mes: string;
  /** Token optimista capturado por PostgreSQL al generar esta vista previa. */
  versionBase: number;
  errors: PlaneacionMensualIssue[];
  warnings: PlaneacionMensualIssue[];
  conflicts: PlaneacionMensualIssue[];
  impact?: {
    operations: number;
    employees: number;
    pdvs: number;
  };
}

export interface AplicarPlaneacionMensualResult {
  ok: boolean;
  idempotent: boolean;
  loteId: string;
  version: number;
  preview?: PlaneacionMensualPreview;
}

export interface PrevisualizarPlaneacionMensualInput {
  cuentaClienteId: string;
  mes: string;
  operaciones: PlaneacionMensualOperacion[];
}

export interface AplicarPlaneacionMensualInput extends PrevisualizarPlaneacionMensualInput {
  idempotencyKey: string;
  versionBase: number;
  usuarioId: string;
}

export interface PlaneacionMensualActionState {
  ok: boolean;
  message: string;
  preview: PlaneacionMensualPreview | null;
  loteId: string | null;
  version: number | null;
  materializacionPendiente: boolean;
}

export type PlaneacionMensualDiaCodigo =
  | '1'
  | 'D'
  | 'COV'
  | 'FOR'
  | 'I'
  | 'IS'
  | 'VAC'
  | 'JUS'
  | 'SIN'
  | 'PC'
  | '—';

export type PlaneacionMensualDia = readonly [
  fecha: string,
  codigo: PlaneacionMensualDiaCodigo,
  turnoCodigo: string | null,
  turnoColor: string | null,
  cuotaDia: number,
  cuotaAsignada: number,
];

export interface PlaneacionMensualFila {
  segmentoClave: string;
  segmentoTipo: 'DC' | 'VACANTE';
  cadenaId: string | null;
  cadenaNombre: string | null;
  pdvId: string;
  pdvClave: string | null;
  pdvNombre: string;
  pdvEstatus: PlaneacionMensualPdvEstatus | null;
  ciudadId: string | null;
  ciudadNombre: string | null;
  zona: string | null;
  empleadoId: string | null;
  empleadoNomina: string | null;
  empleadoNombre: string;
  rol: string;
  factorTiempo: number;
  naturaleza: string;
  asignacionId: string | null;
  rangoFechaInicio: string;
  rangoFechaFin: string;
  diasLaborales: string | null;
  diaDescanso: string | null;
  horarioReferencia: string | null;
  supervisorId: string | null;
  supervisorNombre: string | null;
  diasLaborados: number;
  diasProgramados: number;
  cuotaMensual: number;
  cuotaIndividual: number;
  dias: PlaneacionMensualDia[];
}

export interface PlaneacionMensualResumen {
  ok: boolean;
  mes: string;
  version: number;
  generatedAt: string | null;
  total: number;
  truncated: boolean;
  empleadosDisponibles: PlaneacionMensualCatalogoOpcion[];
  supervisoresDisponibles: PlaneacionMensualCatalogoOpcion[];
  rows: PlaneacionMensualFila[];
}

export interface PlaneacionMensualCatalogoOpcion {
  id: string;
  label: string;
}

export interface PlaneacionMensualFiltros {
  busqueda?: string | null;
  cadenaIds?: string[];
  supervisorIds?: string[];
  estados?: string[];
  limit?: number;
}

export interface PlaneacionMensualDetallePersona {
  empleado_id: string;
  nombre_completo: string;
  estado_operativo: string | null;
  origen: string | null;
  pdv_resuelto_id: string | null;
  horario_inicio: string | null;
  horario_fin: string | null;
  mensaje_operativo: string | null;
  referencia_tabla: string | null;
  referencia_id: string | null;
  asignacion_id: string | null;
  tipo: string | null;
  factor_tiempo: number | null;
  naturaleza: string | null;
  dias_laborales: string | null;
  dia_descanso: string | null;
  horario_referencia: string | null;
  programada: boolean | null;
}

export interface PlaneacionMensualDetalleDia {
  ok: boolean;
  fecha: string;
  pdv: {
    id: string;
    clave: string | null;
    nombre: string;
    cadenaNombre: string | null;
    ciudadNombre: string | null;
  } | null;
  cuotaDia: number;
  personas: PlaneacionMensualDetallePersona[];
}

export interface PlaneacionCuotaImportIssueView {
  rowNumber: number;
  code: string;
  message: string;
}

export interface PlaneacionCuotaImportPreviewRow {
  rowNumber: number;
  pdvId: string;
  claveBtl: string;
  cadenaNombre: string | null;
  pdvNombre: string;
  cuotaMensual: number;
  diasMes: number;
  cuotaDiariaMinima: number;
  cuotaDiariaMaxima: number;
}

export interface PlaneacionCuotaImportSummary {
  pdvs: number;
  dias: number;
  cuotaMensual: number;
  cuotaAtribuida?: number;
  cuotaNoAtribuida?: number;
  atribuciones?: number;
}

export interface PlaneacionCuotaImportActionState {
  ok: boolean;
  readyToApply: boolean;
  applied: boolean;
  idempotent: boolean;
  message: string;
  hash: string | null;
  loteId: string | null;
  issues: PlaneacionCuotaImportIssueView[];
  rows: PlaneacionCuotaImportPreviewRow[];
  summary: PlaneacionCuotaImportSummary | null;
  refreshPending: boolean;
}
