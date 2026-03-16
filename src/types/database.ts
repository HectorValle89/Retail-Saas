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
  fecha_baja: string | null
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
  estatus: 'ACTIVO' | 'INACTIVO'
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
  factor_tiempo: number
  dias_laborales: string | null
  dia_descanso: string | null
  horario_referencia: string | null
  observaciones: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
  created_at: string
  updated_at: string
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

export interface RutaSemanal {
  id: string
  cuenta_cliente_id: string
  supervisor_empleado_id: string
  semana_inicio: string
  estatus: 'BORRADOR' | 'PUBLICADA' | 'EN_PROGRESO' | 'CERRADA'
  notas: string | null
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

export interface PeriodoNomina {
  id: string
  clave: string
  fecha_inicio: string
  fecha_fin: string
  estado: 'ABIERTO' | 'CERRADO'
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

export interface Database {
  public: {
    Tables: {
      cuenta_cliente: { Row: CuentaCliente }
      cadena: {
        Row: {
          id: string
          codigo: string
          nombre: string
          factor_cuota_default: number
          activa: boolean
          created_at: string
          updated_at: string
        }
      }
      ciudad: {
        Row: {
          id: string
          nombre: string
          zona: string
          activa: boolean
          created_at: string
          updated_at: string
        }
      }
      empleado: { Row: Empleado }
      usuario: { Row: UsuarioSistema }
      archivo_hash: { Row: ArchivoHash }
      empleado_documento: { Row: EmpleadoDocumento }
      pdv: { Row: Pdv }
      geocerca_pdv: { Row: GeocercaPdv }
      cuenta_cliente_pdv: { Row: CuentaClientePdv }
      configuracion: { Row: ConfiguracionSistema }
      regla_negocio: { Row: ReglaNegocio }
      mision_dia: { Row: MisionDia }
      producto: { Row: Producto }
      asignacion: { Row: Asignacion }
      ruta_semanal: { Row: RutaSemanal }
      ruta_semanal_visita: { Row: RutaSemanalVisita }
      asistencia: { Row: Asistencia }
      venta: { Row: Venta }
      nomina_periodo: { Row: PeriodoNomina }
      cuota_empleado_periodo: { Row: CuotaEmpleadoPeriodo }
      nomina_ledger: { Row: NominaLedger }
    }
  }
}


