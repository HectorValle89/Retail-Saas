import type { Database as GeneratedDatabase } from './database.generated'

export type Puesto =
  | 'DERMOCONSEJERO'
  | 'SUPERVISOR'
  | 'COORDINADOR'
  | 'RECLUTAMIENTO'
  | 'NOMINA'
  | 'LOGISTICA'
  | 'LOVE_IS'
  | 'VENTAS'
  | 'ADMINISTRADOR'
  | 'CLIENTE'

export type EstadoCuenta =
  | 'PROVISIONAL'
  | 'PENDIENTE_VERIFICACION_EMAIL'
  | 'ACTIVA'
  | 'SUSPENDIDA'
  | 'BAJA'

export interface CuentaCliente {
  id: string
  identificador: string
  nombre: string
  activa: boolean
  configuracion: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Empleado {
  id: string
  id_nomina: string | null
  nombre_completo: string
  curp: string | null
  nss: string | null
  rfc: string | null
  puesto: Puesto
  zona: string | null
  correo_electronico: string | null
  telefono: string | null
  estatus_laboral: 'ACTIVO' | 'SUSPENDIDO' | 'BAJA'
  fecha_alta: string | null
  fecha_nacimiento: string | null
  fecha_baja: string | null
  domicilio_completo: string | null
  codigo_postal: string | null
  edad: number | null
  anios_laborando: number | null
  sexo: string | null
  estado_civil: string | null
  originario: string | null
  sbc_diario: number | null
  supervisor_empleado_id: string | null
  sueldo_base_mensual: number | null
  expediente_estado: 'PENDIENTE_DOCUMENTOS' | 'EN_REVISION' | 'VALIDADO' | 'OBSERVADO'
  expediente_validado_en: string | null
  expediente_validado_por_usuario_id: string | null
  expediente_observaciones: string | null
  imss_estado: 'NO_INICIADO' | 'PENDIENTE_DOCUMENTOS' | 'EN_PROCESO' | 'ALTA_IMSS' | 'ERROR'
  imss_fecha_solicitud: string | null
  imss_fecha_alta: string | null
  imss_observaciones: string | null
  motivo_baja: string | null
  checklist_baja: Record<string, boolean>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UsuarioSistema {
  id: string
  auth_user_id: string | null
  empleado_id: string
  cuenta_cliente_id: string | null
  username: string | null
  estado_cuenta: EstadoCuenta
  correo_electronico: string | null
  correo_verificado: boolean
  password_temporal_generada_en: string | null
  password_temporal_expira_en: string | null
  ultimo_acceso_en: string | null
  created_at: string
  updated_at: string
}

export interface ArchivoHash {
  id: string
  sha256: string
  bucket: string
  ruta_archivo: string
  mime_type: string | null
  tamano_bytes: number | null
  miniatura_sha256: string | null
  miniatura_bucket: string | null
  miniatura_ruta_archivo: string | null
  miniatura_mime_type: string | null
  miniatura_tamano_bytes: number | null
  creado_por_usuario_id: string | null
  created_at: string
  updated_at: string
}

export interface EmpleadoDocumento {
  id: string
  empleado_id: string
  archivo_hash_id: string
  categoria: 'EXPEDIENTE' | 'IMSS' | 'BAJA'
  tipo_documento:
    | 'CURP'
    | 'RFC'
    | 'NSS'
    | 'INE'
    | 'COMPROBANTE_DOMICILIO'
    | 'CONTRATO'
    | 'ALTA_IMSS'
    | 'BAJA'
    | 'OTRO'
  nombre_archivo_original: string
  mime_type: string | null
  tamano_bytes: number | null
  estado_documento: 'CARGADO' | 'VALIDADO' | 'OBSERVADO'
  ocr_provider: string | null
  ocr_resultado: Record<string, unknown>
  metadata: Record<string, unknown>
  creado_por_usuario_id: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  tabla: string
  registro_id: string
  accion: string
  payload: Record<string, unknown>
  usuario_id: string | null
  cuenta_cliente_id: string | null
  created_at: string
  updated_at: string
}

export interface Pdv {
  id: string
  clave_btl: string
  cadena_id: string | null
  ciudad_id: string | null
  id_cadena: string | null
  nombre: string
  direccion: string | null
  zona: string | null
  formato: string | null
  horario_entrada: string | null
  horario_salida: string | null
  estatus: 'ACTIVO' | 'TEMPORAL' | 'INACTIVO'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PdvCoberturaOperativa {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  estado_operativo: 'CUBIERTO' | 'RESERVADO_PENDIENTE_ACCESO' | 'VACANTE'
  motivo_operativo:
    | 'SIN_DC'
    | 'EN_PROCESO_FIRMA'
    | 'PENDIENTE_ACCESO'
    | 'PDV_DE_PASO'
    | 'TIENDA_ESCUELA'
    | 'MOVIMIENTO_TEMPORAL'
    | null
  empleado_reservado_id: string | null
  pdv_paso_id: string | null
  acceso_pendiente_desde: string | null
  proximo_recordatorio_at: string | null
  apartado_por_usuario_id: string | null
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PdvRotacionMaestra {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  clasificacion_maestra: 'FIJO' | 'ROTATIVO'
  grupo_rotacion_codigo: string | null
  grupo_tamano: 2 | 3 | null
  slot_rotacion: 'A' | 'B' | 'C' | null
  fuente: 'SUGERIDA' | 'IMPORTADA'
  vigente: boolean
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface GeocercaPdv {
  id: string
  pdv_id: string
  latitud: number
  longitud: number
  radio_tolerancia_metros: number
  permite_checkin_con_justificacion: boolean
  created_at: string
  updated_at: string
}

export interface ConfiguracionSistema {
  id: string
  clave: string
  valor: unknown
  descripcion: string | null
  modulo: string
  created_at: string
  updated_at: string
}

export interface Cadena {
  id: string
  codigo: string | null
  nombre: string
  factor_cuota_default: number
  activa: boolean
  created_at: string
  updated_at: string
}

export interface Ciudad {
  id: string
  nombre: string
  zona: string
  estado: string | null
  activa: boolean
  created_at: string
  updated_at: string
}

export interface CuentaClientePdv {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
  created_at: string
  updated_at: string
}

export interface ReglaNegocio {
  id: string
  codigo: string
  modulo: string
  descripcion: string
  severidad: 'ERROR' | 'ALERTA' | 'AVISO'
  prioridad: number
  condicion: Record<string, unknown>
  accion: Record<string, unknown>
  activa: boolean
  created_at: string
  updated_at: string
}

export interface HorarioPdv {
  id: string
  pdv_id: string
  nivel_prioridad: number
  fecha_especifica: string | null
  dia_semana: number | null
  codigo_turno: string | null
  hora_entrada: string
  hora_salida: string
  activo: boolean
  observaciones: string | null
  created_at: string
  updated_at: string
}

export interface SupervisorPdv {
  id: string
  pdv_id: string
  empleado_id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
  created_at: string
  updated_at: string
}

export interface MisionDia {
  id: string
  codigo: string | null
  instruccion: string
  activa: boolean
  orden: number | null
  peso: number
  created_at: string
  updated_at: string
}

export interface Producto {
  id: string
  sku: string
  nombre: string
  nombre_corto: string
  categoria: string
  top_30: boolean
  activo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Asignacion {
  id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  pdv_id: string
  supervisor_empleado_id: string | null
  clave_btl: string | null
  fecha_inicio: string
  fecha_fin: string | null
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  naturaleza: 'BASE' | 'COBERTURA_TEMPORAL' | 'COBERTURA_PERMANENTE' | 'MOVIMIENTO'
  retorna_a_base: boolean
  asignacion_base_id: string | null
  asignacion_origen_id: string | null
  prioridad: number
  motivo_movimiento: string | null
  generado_automaticamente: boolean
  factor_tiempo: number
  dias_laborales: string | null
  dia_descanso: string | null
  horario_referencia: string | null
  observaciones: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
  created_at: string
  updated_at: string
}

export interface AsignacionDiariaResuelta {
  fecha: string
  empleado_id: string
  pdv_id: string | null
  supervisor_empleado_id: string | null
  coordinador_empleado_id: string | null
  cuenta_cliente_id: string | null
  estado_operativo:
    | 'ASIGNADA_PDV'
    | 'FORMACION'
    | 'VACACIONES'
    | 'INCAPACIDAD'
    | 'FALTA_JUSTIFICADA'
    | 'SIN_ASIGNACION'
  origen:
    | 'BASE'
    | 'COBERTURA_TEMPORAL'
    | 'COBERTURA_PERMANENTE'
    | 'FORMACION'
    | 'VACACIONES'
    | 'INCAPACIDAD'
    | 'JUSTIFICACION'
    | 'NINGUNO'
  referencia_tabla: 'asignacion' | 'solicitud' | 'formacion' | null
  referencia_id: string | null
  mensaje_operativo: string | null
  laborable: boolean
  trabaja_en_tienda: boolean
  sede_formacion: string | null
  horario_inicio: string | null
  horario_fin: string | null
  flags: Record<string, unknown>
  refreshed_at: string
}

export interface AsignacionDiariaDirtyQueue {
  id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string
  motivo: string
  payload: Record<string, unknown>
  estado: 'PENDIENTE' | 'PROCESANDO' | 'PROCESADO' | 'ERROR'
  intentos: number
  error_message: string | null
  created_at: string
  updated_at: string
  procesado_at: string | null
}

export interface Asistencia {
  id: string
  cuenta_cliente_id: string
  asignacion_id: string | null
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string
  fecha_operacion: string
  empleado_nombre: string
  pdv_clave_btl: string
  pdv_nombre: string
  pdv_zona: string | null
  cadena_nombre: string | null
  check_in_utc: string | null
  check_out_utc: string | null
  latitud_check_in: number | null
  longitud_check_in: number | null
  latitud_check_out: number | null
  longitud_check_out: number | null
  distancia_check_in_metros: number | null
  distancia_check_out_metros: number | null
  estado_gps: 'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS'
  justificacion_fuera_geocerca: string | null
  mision_dia_id: string | null
  mision_codigo: string | null
  mision_instruccion: string | null
  biometria_estado: 'PENDIENTE' | 'VALIDA' | 'RECHAZADA' | 'NO_EVALUADA'
  biometria_score: number | null
  selfie_check_in_hash: string | null
  selfie_check_in_url: string | null
  selfie_check_out_hash: string | null
  selfie_check_out_url: string | null
  estatus: 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA'
  origen: 'ONLINE' | 'OFFLINE_SYNC' | 'AJUSTE_ADMIN'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Venta {
  id: string
  cuenta_cliente_id: string
  asistencia_id: string
  empleado_id: string
  pdv_id: string
  producto_id: string | null
  producto_sku: string | null
  producto_nombre: string
  producto_nombre_corto: string | null
  fecha_utc: string
  total_unidades: number
  total_monto: number
  confirmada: boolean
  validada_por_empleado_id: string | null
  validada_en: string | null
  observaciones: string | null
  origen: 'ONLINE' | 'OFFLINE_SYNC' | 'AJUSTE_ADMIN'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LoveIsdin {
  id: string
  cuenta_cliente_id: string
  asistencia_id: string | null
  empleado_id: string
  pdv_id: string
  qr_codigo_id: string | null
  qr_asignacion_id: string | null
  qr_personal: string | null
  afiliado_nombre: string
  afiliado_contacto: string | null
  ticket_folio: string | null
  fecha_utc: string
  estatus: 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'DUPLICADA'
  evidencia_url: string | null
  evidencia_hash: string | null
  origen: 'ONLINE' | 'OFFLINE_SYNC' | 'AJUSTE_ADMIN'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LoveIsdinQrCodigo {
  id: string
  cuenta_cliente_id: string
  codigo: string
  imagen_url: string | null
  imagen_hash: string | null
  estado: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LoveIsdinQrAsignacion {
  id: string
  cuenta_cliente_id: string
  qr_codigo_id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string | null
  motivo: string | null
  observaciones: string | null
  created_by_usuario_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LoveIsdinQrImportLote {
  id: string
  cuenta_cliente_id: string
  archivo_nombre: string
  archivo_hash: string | null
  estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO'
  resumen: Record<string, unknown>
  advertencias: Array<Record<string, unknown>>
  metadata: Record<string, unknown>
  confirmado_por_usuario_id: string | null
  confirmado_en: string | null
  created_at: string
  updated_at: string
}

export interface LoveIsdinResumenDiario {
  fecha_operacion: string
  cuenta_cliente_id: string
  pdv_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  zona: string | null
  cadena: string | null
  qr_codigo_id: string | null
  afiliaciones_total: number
  afiliaciones_validas: number
  afiliaciones_pendientes: number
  afiliaciones_rechazadas: number
  afiliaciones_duplicadas: number
}

export interface RegistroExtemporaneo {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string
  asistencia_id: string | null
  fecha_operativa: string
  fecha_registro_utc: string
  tipo_registro: 'VENTA' | 'LOVE_ISDIN' | 'AMBAS'
  estatus: 'PENDIENTE_APROBACION' | 'APROBADO' | 'RECHAZADO'
  motivo: string
  motivo_rechazo: string | null
  evidencia_url: string | null
  evidencia_hash: string | null
  evidencia_thumbnail_url: string | null
  evidencia_thumbnail_hash: string | null
  venta_payload: Record<string, unknown>
  love_payload: Record<string, unknown>
  venta_registro_id: string | null
  love_registro_id: string | null
  aprobado_por_empleado_id: string | null
  aprobado_en: string | null
  rechazado_por_empleado_id: string | null
  rechazado_en: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Solicitud {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  tipo:
    | 'INCAPACIDAD'
    | 'VACACIONES'
    | 'PERMISO'
    | 'AVISO_INASISTENCIA'
    | 'JUSTIFICACION_FALTA'
  fecha_inicio: string
  fecha_fin: string
  motivo: string | null
  justificante_url: string | null
  justificante_hash: string | null
  estatus:
    | 'BORRADOR'
    | 'ENVIADA'
    | 'VALIDADA_SUP'
    | 'REGISTRADA_RH'
    | 'REGISTRADA'
    | 'RECHAZADA'
    | 'CORRECCION_SOLICITADA'
  comentarios: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Gasto {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string | null
  formacion_evento_id: string | null
  tipo: 'VIATICOS' | 'TRANSPORTE' | 'ALIMENTOS' | 'MATERIAL_POP' | 'FORMACION' | 'HOSPEDAJE' | 'OTRO'
  monto: number
  moneda: string
  fecha_gasto: string
  comprobante_url: string | null
  comprobante_hash: string | null
  estatus: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'REEMBOLSADO'
  notas: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EntregaMaterial {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string | null
  tipo_material: string
  descripcion_material: string | null
  cantidad: number
  fecha_entrega: string
  fecha_devolucion: string | null
  estado: 'ENTREGADO' | 'DEVUELTO_PARCIAL' | 'DEVUELTO' | 'PERDIDO' | 'DANADO'
  evidencia_entrega_url: string | null
  evidencia_entrega_hash: string | null
  evidencia_devolucion_url: string | null
  evidencia_devolucion_hash: string | null
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialCatalogo {
  id: string
  cuenta_cliente_id: string
  nombre: string
  tipo: string
  cantidad_default: number
  requiere_ticket_compra: boolean
  requiere_evidencia_obligatoria: boolean
  activo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialDistribucionLote {
  id: string
  cuenta_cliente_id: string
  mes_operacion: string
  estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO'
  archivo_nombre: string
  archivo_url: string | null
  archivo_hash: string | null
  archivo_mime_type: string | null
  archivo_tamano_bytes: number | null
  gemini_status: 'SIN_INTENTO' | 'OK' | 'ADVERTENCIA' | 'ERROR' | 'NO_CONFIGURADO'
  advertencias: unknown[]
  resumen: Record<string, unknown>
  preview_data: Record<string, unknown>
  metadata: Record<string, unknown>
  created_by_usuario_id: string | null
  confirmado_por_usuario_id: string | null
  confirmado_en: string | null
  created_at: string
  updated_at: string
}

export interface MaterialDistribucionMensual {
  id: string
  cuenta_cliente_id: string
  lote_id: string | null
  pdv_id: string
  supervisor_empleado_id: string | null
  confirmado_por_empleado_id: string | null
  mes_operacion: string
  estado:
    | 'PENDIENTE_RECEPCION'
    | 'RECIBIDA_CONFORME'
    | 'RECIBIDA_CON_OBSERVACIONES'
    | 'PENDIENTE_ACLARACION'
    | 'CANCELADA'
  cadena_snapshot: string | null
  id_pdv_cadena_snapshot: string | null
  sucursal_snapshot: string | null
  nombre_dc_snapshot: string | null
  territorio_snapshot: string | null
  hoja_origen: string | null
  firma_recepcion_url: string | null
  firma_recepcion_hash: string | null
  foto_recepcion_url: string | null
  foto_recepcion_hash: string | null
  foto_recepcion_capturada_en: string | null
  confirmado_en: string | null
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialDistribucionDetalle {
  id: string
  distribucion_id: string
  material_catalogo_id: string
  cantidad_enviada: number
  cantidad_recibida: number
  cantidad_entregada: number
  cantidad_observada: number
  material_nombre_snapshot: string | null
  material_tipo_mes: string | null
  mecanica_canje: string | null
  indicaciones_producto: string | null
  instrucciones_mercadeo: string | null
  requiere_ticket_mes: boolean
  requiere_evidencia_entrega_mes: boolean
  requiere_evidencia_mercadeo: boolean
  es_regalo_dc: boolean
  excluir_de_registrar_entrega: boolean
  total_columna_hoja: number | null
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialInventarioMovimiento {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  material_catalogo_id: string
  lote_id: string | null
  distribucion_id: string | null
  distribucion_detalle_id: string | null
  conteo_jornada_id: string | null
  empleado_id: string | null
  tipo_movimiento:
    | 'RECEPCION_LOTE'
    | 'ENTREGA_CLIENTE'
    | 'AJUSTE_FUERA_TURNO'
    | 'MERMA'
    | 'APERTURA_JORNADA'
    | 'CIERRE_JORNADA'
  sentido: 'ENTRADA' | 'SALIDA' | 'NEUTRO'
  cantidad: number
  cantidad_delta: number
  motivo: string | null
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialConteoJornada {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  empleado_id: string
  fecha_operacion: string
  momento: 'APERTURA' | 'CIERRE'
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialConteoJornadaDetalle {
  id: string
  conteo_id: string
  material_catalogo_id: string
  cantidad_contada: number
  diferencia_detectada: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialEvidenciaMercadeo {
  id: string
  cuenta_cliente_id: string
  lote_id: string
  distribucion_id: string
  pdv_id: string
  empleado_id: string
  distribucion_detalle_ids: string[]
  foto_url: string
  foto_hash: string | null
  foto_capturada_en: string
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MaterialEntregaPromocional {
  id: string
  cuenta_cliente_id: string
  distribucion_id: string | null
  distribucion_detalle_id: string | null
  material_catalogo_id: string
  empleado_id: string
  pdv_id: string
  cantidad_entregada: number
  fecha_utc: string
  evidencia_material_url: string | null
  evidencia_material_hash: string | null
  evidencia_pdv_url: string | null
  evidencia_pdv_hash: string | null
  ticket_compra_url: string | null
  ticket_compra_hash: string | null
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RutaSemanal {
  id: string
  cuenta_cliente_id: string
  supervisor_empleado_id: string
  semana_inicio: string
  estatus: 'BORRADOR' | 'PUBLICADA' | 'EN_PROGRESO' | 'CERRADA'
  notas: string | null
  metadata: Record<string, unknown>
  created_by_usuario_id: string | null
  updated_by_usuario_id: string | null
  created_at: string
  updated_at: string
}

export interface RutaSemanalVisita {
  id: string
  ruta_semanal_id: string
  cuenta_cliente_id: string
  supervisor_empleado_id: string
  pdv_id: string
  asignacion_id: string | null
  dia_semana: number
  orden: number
  estatus: 'PLANIFICADA' | 'COMPLETADA' | 'CANCELADA'
  selfie_url: string | null
  selfie_hash: string | null
  evidencia_url: string | null
  evidencia_hash: string | null
  checklist_calidad: Record<string, boolean>
  comentarios: string | null
  completada_en: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RutaAgendaEvento {
  id: string
  cuenta_cliente_id: string
  ruta_semanal_id: string
  ruta_semanal_visita_id: string | null
  supervisor_empleado_id: string
  pdv_id: string | null
  fecha_operacion: string
  tipo_evento:
    | 'VISITA_ADICIONAL'
    | 'OFICINA'
    | 'FIRMA_CONTRATO'
    | 'FORMACION'
    | 'ENTREGA_NUEVA_DC'
    | 'PRESENTACION_GERENTE'
    | 'VISITA_EMERGENCIA'
    | 'OTRO'
  modo_impacto: 'SUMA' | 'SOBREPONE_PARCIAL' | 'REEMPLAZA_TOTAL'
  estatus_aprobacion: 'NO_REQUIERE' | 'PENDIENTE_COORDINACION' | 'APROBADO' | 'RECHAZADO'
  estatus_ejecucion: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'CANCELADO'
  titulo: string
  descripcion: string | null
  sede: string | null
  hora_inicio: string | null
  hora_fin: string | null
  selfie_url: string | null
  selfie_hash: string | null
  evidencia_url: string | null
  evidencia_hash: string | null
  check_in_en: string | null
  check_out_en: string | null
  metadata: Record<string, unknown>
  created_by_usuario_id: string | null
  resolved_by_usuario_id: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface RutaVisitaPendienteReposicion {
  id: string
  cuenta_cliente_id: string
  ruta_semanal_id: string
  ruta_semanal_visita_id: string
  agenda_evento_id: string | null
  supervisor_empleado_id: string
  pdv_id: string
  fecha_origen: string
  semana_sugerida_inicio: string | null
  clasificacion: 'JUSTIFICADA' | 'INJUSTIFICADA'
  motivo: string
  estado: 'PENDIENTE' | 'REPROGRAMADA' | 'DESCARTADA' | 'EJECUTADA'
  ruta_destino_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PeriodoNomina {
  id: string
  clave: string
  fecha_inicio: string
  fecha_fin: string
  estado: 'BORRADOR' | 'APROBADO' | 'DISPERSADO'
  fecha_cierre: string | null
  observaciones: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CuotaEmpleadoPeriodo {
  id: string
  periodo_id: string
  cuenta_cliente_id: string
  empleado_id: string
  cadena_id: string | null
  objetivo_monto: number
  objetivo_unidades: number
  avance_monto: number
  avance_unidades: number
  factor_cuota: number
  cumplimiento_porcentaje: number
  bono_estimado: number
  estado: 'EN_CURSO' | 'CUMPLIDA' | 'RIESGO'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface NominaLedger {
  id: string
  periodo_id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  tipo_movimiento: 'PERCEPCION' | 'DEDUCCION' | 'AJUSTE'
  concepto: string
  referencia_tabla: string | null
  referencia_id: string | null
  monto: number
  moneda: string
  notas: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Campana {
  id: string
  cuenta_cliente_id: string
  cadena_id: string | null
  nombre: string
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string
  estado: 'BORRADOR' | 'ACTIVA' | 'CERRADA' | 'CANCELADA'
  productos_foco: string[]
  cuota_adicional: number
  instrucciones: string | null
  evidencias_requeridas: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CampanaPdv {
  id: string
  campana_id: string
  cuenta_cliente_id: string
  pdv_id: string
  dc_empleado_id: string | null
  tareas_requeridas: string[]
  tareas_cumplidas: string[]
  estatus_cumplimiento: string
  avance_porcentaje: number
  evidencias_cargadas: number
  comentarios: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CampanaPdvProductoMeta {
  id: string
  campana_id: string
  campana_pdv_id: string
  cuenta_cliente_id: string
  pdv_id: string
  producto_id: string
  cuota: number
  tipo_meta: 'VENTA' | 'EXHIBICION'
  observaciones: string | null
  created_at: string
  updated_at: string
}

export interface MensajeInterno {
  id: string
  cuenta_cliente_id: string
  creado_por_usuario_id: string | null
  titulo: string
  cuerpo: string
  tipo: 'MENSAJE' | 'ENCUESTA'
  grupo_destino: 'TODOS_DCS' | 'ZONA' | 'SUPERVISOR' | 'PUESTO'
  zona: string | null
  supervisor_empleado_id: string | null
  opciones_respuesta: Record<string, unknown>[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MensajeEncuestaPregunta {
  id: string
  mensaje_id: string
  cuenta_cliente_id: string
  orden: number
  titulo: string
  descripcion: string | null
  tipo_pregunta: 'OPCION_MULTIPLE' | 'RESPUESTA_LIBRE'
  opciones: Record<string, unknown>[]
  obligatoria: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MensajeReceptor {
  id: string
  mensaje_id: string
  cuenta_cliente_id: string
  empleado_id: string
  leido_en: string | null
  respondido_en: string | null
  respuesta: string | null
  estado: 'PENDIENTE' | 'LEIDO' | 'RESPONDIDO'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MensajeEncuestaRespuesta {
  id: string
  mensaje_id: string
  mensaje_receptor_id: string
  pregunta_id: string
  cuenta_cliente_id: string
  empleado_id: string
  opcion_id: string | null
  opcion_label: string | null
  respuesta_texto: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MensajeAdjunto {
  id: string
  mensaje_id: string
  cuenta_cliente_id: string
  archivo_hash_id: string
  nombre_archivo_original: string
  mime_type: string | null
  tamano_bytes: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PushSubscriptionRegistro {
  id: string
  cuenta_cliente_id: string | null
  usuario_id: string
  empleado_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  ultima_suscripcion_en: string
  ultimo_envio_en: string | null
  ultimo_error: string | null
  activa: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
export interface FormacionEvento {
  id: string
  cuenta_cliente_id: string
  nombre: string
  descripcion: string | null
  sede: string
  ciudad: string | null
  tipo: string
  responsable_empleado_id: string | null
  fecha_inicio: string
  fecha_fin: string
  estado: 'PENDIENTE' | 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA'
  participantes: Record<string, unknown>[]
  gastos_operativos: Record<string, unknown>[]
  notificaciones: Record<string, unknown>[]
  created_by_usuario_id: string | null
  updated_by_usuario_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FormacionAsistencia {
  id: string
  evento_id: string
  cuenta_cliente_id: string
  empleado_id: string
  participante_nombre: string | null
  puesto: string | null
  confirmado: boolean
  presente: boolean
  estado: string
  evidencias: Record<string, unknown>[]
  comentarios: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type Database = GeneratedDatabase
