export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      archivo_hash: {
        Row: {
          bucket: string
          creado_por_usuario_id: string | null
          created_at: string
          id: string
          miniatura_bucket: string | null
          miniatura_mime_type: string | null
          miniatura_ruta_archivo: string | null
          miniatura_sha256: string | null
          miniatura_tamano_bytes: number | null
          mime_type: string | null
          ruta_archivo: string
          sha256: string
          tamano_bytes: number | null
        }
        Insert: {
          bucket: string
          creado_por_usuario_id?: string | null
          created_at?: string
          id?: string
          miniatura_bucket?: string | null
          miniatura_mime_type?: string | null
          miniatura_ruta_archivo?: string | null
          miniatura_sha256?: string | null
          miniatura_tamano_bytes?: number | null
          mime_type?: string | null
          ruta_archivo: string
          sha256: string
          tamano_bytes?: number | null
        }
        Update: {
          bucket?: string
          creado_por_usuario_id?: string | null
          created_at?: string
          id?: string
          miniatura_bucket?: string | null
          miniatura_mime_type?: string | null
          miniatura_ruta_archivo?: string | null
          miniatura_sha256?: string | null
          miniatura_tamano_bytes?: number | null
          mime_type?: string | null
          ruta_archivo?: string
          sha256?: string
          tamano_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "archivo_hash_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      asignacion: {
        Row: {
          asignacion_base_id: string | null
          asignacion_origen_id: string | null
          clave_btl: string | null
          created_at: string
          cuenta_cliente_id: string | null
          dia_descanso: string | null
          dias_laborales: string | null
          empleado_id: string
          estado_publicacion: string
          factor_tiempo: number
          fecha_fin: string | null
          fecha_inicio: string
          generado_automaticamente: boolean
          horario_referencia: string | null
          id: string
          motivo_movimiento: string | null
          naturaleza: string
          observaciones: string | null
          pdv_id: string
          prioridad: number
          retorna_a_base: boolean
          supervisor_empleado_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          asignacion_base_id?: string | null
          asignacion_origen_id?: string | null
          clave_btl?: string | null
          created_at?: string
          cuenta_cliente_id?: string | null
          dia_descanso?: string | null
          dias_laborales?: string | null
          empleado_id: string
          estado_publicacion?: string
          factor_tiempo?: number
          fecha_fin?: string | null
          fecha_inicio: string
          generado_automaticamente?: boolean
          horario_referencia?: string | null
          id?: string
          motivo_movimiento?: string | null
          naturaleza?: string
          observaciones?: string | null
          pdv_id: string
          prioridad?: number
          retorna_a_base?: boolean
          supervisor_empleado_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          asignacion_base_id?: string | null
          asignacion_origen_id?: string | null
          clave_btl?: string | null
          created_at?: string
          cuenta_cliente_id?: string | null
          dia_descanso?: string | null
          dias_laborales?: string | null
          empleado_id?: string
          estado_publicacion?: string
          factor_tiempo?: number
          fecha_fin?: string | null
          fecha_inicio?: string
          generado_automaticamente?: boolean
          horario_referencia?: string | null
          id?: string
          motivo_movimiento?: string | null
          naturaleza?: string
          observaciones?: string | null
          pdv_id?: string
          prioridad?: number
          retorna_a_base?: boolean
          supervisor_empleado_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignacion_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignacion_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "asignacion_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignacion_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignacion_supervisor_empleado_id_fkey"
            columns: ["supervisor_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
        ]
      }
      asistencia: {
        Row: {
          asignacion_id: string | null
          biometria_estado: string
          biometria_score: number | null
          cadena_nombre: string | null
          check_in_utc: string | null
          check_out_utc: string | null
          created_at: string
          cuenta_cliente_id: string
          distancia_check_in_metros: number | null
          distancia_check_out_metros: number | null
          empleado_id: string
          empleado_nombre: string
          estado_gps: string
          estatus: string
          fecha_operacion: string
          id: string
          justificacion_fuera_geocerca: string | null
          latitud_check_in: number | null
          latitud_check_out: number | null
          longitud_check_in: number | null
          longitud_check_out: number | null
          metadata: Json
          mision_codigo: string | null
          mision_dia_id: string | null
          mision_instruccion: string | null
          origen: string
          pdv_clave_btl: string
          pdv_id: string
          pdv_nombre: string
          pdv_zona: string | null
          selfie_check_in_hash: string | null
          selfie_check_in_url: string | null
          selfie_check_out_hash: string | null
          selfie_check_out_url: string | null
          supervisor_empleado_id: string | null
          updated_at: string
        }
        Insert: {
          asignacion_id?: string | null
          biometria_estado?: string
          biometria_score?: number | null
          cadena_nombre?: string | null
          check_in_utc?: string | null
          check_out_utc?: string | null
          created_at?: string
          cuenta_cliente_id: string
          distancia_check_in_metros?: number | null
          distancia_check_out_metros?: number | null
          empleado_id: string
          empleado_nombre: string
          estado_gps?: string
          estatus?: string
          fecha_operacion?: string
          id?: string
          justificacion_fuera_geocerca?: string | null
          latitud_check_in?: number | null
          latitud_check_out?: number | null
          longitud_check_in?: number | null
          longitud_check_out?: number | null
          metadata?: Json
          mision_codigo?: string | null
          mision_dia_id?: string | null
          mision_instruccion?: string | null
          origen?: string
          pdv_clave_btl: string
          pdv_id: string
          pdv_nombre: string
          pdv_zona?: string | null
          selfie_check_in_hash?: string | null
          selfie_check_in_url?: string | null
          selfie_check_out_hash?: string | null
          selfie_check_out_url?: string | null
          supervisor_empleado_id?: string | null
          updated_at?: string
        }
        Update: {
          asignacion_id?: string | null
          biometria_estado?: string
          biometria_score?: number | null
          cadena_nombre?: string | null
          check_in_utc?: string | null
          check_out_utc?: string | null
          created_at?: string
          cuenta_cliente_id?: string
          distancia_check_in_metros?: number | null
          distancia_check_out_metros?: number | null
          empleado_id?: string
          empleado_nombre?: string
          estado_gps?: string
          estatus?: string
          fecha_operacion?: string
          id?: string
          justificacion_fuera_geocerca?: string | null
          latitud_check_in?: number | null
          latitud_check_out?: number | null
          longitud_check_in?: number | null
          longitud_check_out?: number | null
          metadata?: Json
          mision_codigo?: string | null
          mision_dia_id?: string | null
          mision_instruccion?: string | null
          origen?: string
          pdv_clave_btl?: string
          pdv_id?: string
          pdv_nombre?: string
          pdv_zona?: string | null
          selfie_check_in_hash?: string | null
          selfie_check_in_url?: string | null
          selfie_check_out_hash?: string | null
          selfie_check_out_url?: string | null
          supervisor_empleado_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencia_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "asistencia_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_mision_dia_id_fkey"
            columns: ["mision_dia_id"]
            isOneToOne: false
            referencedRelation: "mision_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_supervisor_empleado_id_fkey"
            columns: ["supervisor_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: string
          created_at: string
          cuenta_cliente_id: string | null
          hash_sha256: string
          id: number
          payload: Json
          registro_id: string | null
          tabla: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          cuenta_cliente_id?: string | null
          hash_sha256: string
          id?: never
          payload?: Json
          registro_id?: string | null
          tabla: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          cuenta_cliente_id?: string | null
          hash_sha256?: string
          id?: never
          payload?: Json
          registro_id?: string | null
          tabla?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "audit_log_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      cadena: {
        Row: {
          activa: boolean
          codigo: string
          created_at: string
          factor_cuota_default: number
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          codigo: string
          created_at?: string
          factor_cuota_default?: number
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          codigo?: string
          created_at?: string
          factor_cuota_default?: number
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      campana: {
        Row: {
          cadena_id: string | null
          created_at: string
          created_by_usuario_id: string | null
          cuenta_cliente_id: string
          cuota_adicional: number
          descripcion: string | null
          estado: string
          evidencias_requeridas: Json
          fecha_fin: string
          fecha_inicio: string
          id: string
          instrucciones: string | null
          metadata: Json
          nombre: string
          productos_foco: Json
          updated_at: string
          updated_by_usuario_id: string | null
        }
        Insert: {
          cadena_id?: string | null
          created_at?: string
          created_by_usuario_id?: string | null
          cuenta_cliente_id: string
          cuota_adicional?: number
          descripcion?: string | null
          estado?: string
          evidencias_requeridas?: Json
          fecha_fin: string
          fecha_inicio: string
          id?: string
          instrucciones?: string | null
          metadata?: Json
          nombre: string
          productos_foco?: Json
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Update: {
          cadena_id?: string | null
          created_at?: string
          created_by_usuario_id?: string | null
          cuenta_cliente_id?: string
          cuota_adicional?: number
          descripcion?: string | null
          estado?: string
          evidencias_requeridas?: Json
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          instrucciones?: string | null
          metadata?: Json
          nombre?: string
          productos_foco?: Json
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campana_cadena_id_fkey"
            columns: ["cadena_id"]
            isOneToOne: false
            referencedRelation: "cadena"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_created_by_usuario_id_fkey"
            columns: ["created_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "campana_updated_by_usuario_id_fkey"
            columns: ["updated_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      campana_pdv: {
        Row: {
          avance_porcentaje: number
          campana_id: string
          comentarios: string | null
          created_at: string
          cuenta_cliente_id: string
          dc_empleado_id: string | null
          estatus_cumplimiento: string
          evidencias_cargadas: number
          id: string
          metadata: Json
          pdv_id: string
          tareas_cumplidas: Json
          tareas_requeridas: Json
          updated_at: string
          updated_by_usuario_id: string | null
        }
        Insert: {
          avance_porcentaje?: number
          campana_id: string
          comentarios?: string | null
          created_at?: string
          cuenta_cliente_id: string
          dc_empleado_id?: string | null
          estatus_cumplimiento?: string
          evidencias_cargadas?: number
          id?: string
          metadata?: Json
          pdv_id: string
          tareas_cumplidas?: Json
          tareas_requeridas?: Json
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Update: {
          avance_porcentaje?: number
          campana_id?: string
          comentarios?: string | null
          created_at?: string
          cuenta_cliente_id?: string
          dc_empleado_id?: string | null
          estatus_cumplimiento?: string
          evidencias_cargadas?: number
          id?: string
          metadata?: Json
          pdv_id?: string
          tareas_cumplidas?: Json
          tareas_requeridas?: Json
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campana_pdv_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campana"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_pdv_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_pdv_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "campana_pdv_dc_empleado_id_fkey"
            columns: ["dc_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_pdv_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_pdv_updated_by_usuario_id_fkey"
            columns: ["updated_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      ciudad: {
        Row: {
          activa: boolean
          created_at: string
          estado: string | null
          id: string
          nombre: string
          updated_at: string
          zona: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          estado?: string | null
          id?: string
          nombre: string
          updated_at?: string
          zona: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          estado?: string | null
          id?: string
          nombre?: string
          updated_at?: string
          zona?: string
        }
        Relationships: []
      }
      configuracion: {
        Row: {
          clave: string
          created_at: string
          descripcion: string | null
          id: string
          modulo: string
          updated_at: string
          valor: Json
        }
        Insert: {
          clave: string
          created_at?: string
          descripcion?: string | null
          id?: string
          modulo: string
          updated_at?: string
          valor: Json
        }
        Update: {
          clave?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          modulo?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      cuenta_cliente: {
        Row: {
          activa: boolean
          configuracion: Json
          created_at: string
          id: string
          identificador: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          configuracion?: Json
          created_at?: string
          id?: string
          identificador: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          configuracion?: Json
          created_at?: string
          id?: string
          identificador?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      cuenta_cliente_pdv: {
        Row: {
          activo: boolean
          created_at: string
          cuenta_cliente_id: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          pdv_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuenta_cliente_id: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          pdv_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuenta_cliente_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          pdv_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_cliente_pdv_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuenta_cliente_pdv_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "cuenta_cliente_pdv_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
        ]
      }
      cuota_empleado_periodo: {
        Row: {
          avance_monto: number
          avance_unidades: number
          bono_estimado: number
          cadena_id: string | null
          created_at: string
          cuenta_cliente_id: string
          cumplimiento_porcentaje: number
          empleado_id: string
          estado: string
          factor_cuota: number
          id: string
          metadata: Json
          objetivo_monto: number
          objetivo_unidades: number
          periodo_id: string
          updated_at: string
        }
        Insert: {
          avance_monto?: number
          avance_unidades?: number
          bono_estimado?: number
          cadena_id?: string | null
          created_at?: string
          cuenta_cliente_id: string
          cumplimiento_porcentaje?: number
          empleado_id: string
          estado?: string
          factor_cuota?: number
          id?: string
          metadata?: Json
          objetivo_monto?: number
          objetivo_unidades?: number
          periodo_id: string
          updated_at?: string
        }
        Update: {
          avance_monto?: number
          avance_unidades?: number
          bono_estimado?: number
          cadena_id?: string | null
          created_at?: string
          cuenta_cliente_id?: string
          cumplimiento_porcentaje?: number
          empleado_id?: string
          estado?: string
          factor_cuota?: number
          id?: string
          metadata?: Json
          objetivo_monto?: number
          objetivo_unidades?: number
          periodo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuota_empleado_periodo_cadena_id_fkey"
            columns: ["cadena_id"]
            isOneToOne: false
            referencedRelation: "cadena"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_empleado_periodo_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_empleado_periodo_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "cuota_empleado_periodo_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_empleado_periodo_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "nomina_periodo"
            referencedColumns: ["id"]
          },
        ]
      }
      empleado: {
        Row: {
          anios_laborando: number | null
          checklist_baja: Json
          codigo_postal: string | null
          correo_electronico: string | null
          created_at: string
          curp: string | null
          domicilio_completo: string | null
          edad: number | null
          estatus_laboral: string
          estado_civil: string | null
          expediente_estado: string
          expediente_observaciones: string | null
          expediente_validado_en: string | null
          expediente_validado_por_usuario_id: string | null
          fecha_alta: string | null
          fecha_baja: string | null
          fecha_nacimiento: string | null
          id: string
          id_nomina: string | null
          imss_estado: string
          imss_fecha_alta: string | null
          imss_fecha_solicitud: string | null
          imss_observaciones: string | null
          metadata: Json
          motivo_baja: string | null
          nombre_completo: string
          nss: string | null
          originario: string | null
          puesto: string
          rfc: string | null
          sbc_diario: number | null
          sexo: string | null
          sueldo_base_mensual: number | null
          supervisor_empleado_id: string | null
          telefono: string | null
          updated_at: string
          zona: string | null
        }
        Insert: {
          anios_laborando?: number | null
          checklist_baja?: Json
          codigo_postal?: string | null
          correo_electronico?: string | null
          created_at?: string
          curp?: string | null
          domicilio_completo?: string | null
          edad?: number | null
          estatus_laboral?: string
          estado_civil?: string | null
          expediente_estado?: string
          expediente_observaciones?: string | null
          expediente_validado_en?: string | null
          expediente_validado_por_usuario_id?: string | null
          fecha_alta?: string | null
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          id?: string
          id_nomina?: string | null
          imss_estado?: string
          imss_fecha_alta?: string | null
          imss_fecha_solicitud?: string | null
          imss_observaciones?: string | null
          metadata?: Json
          motivo_baja?: string | null
          nombre_completo: string
          nss?: string | null
          originario?: string | null
          puesto: string
          rfc?: string | null
          sbc_diario?: number | null
          sexo?: string | null
          sueldo_base_mensual?: number | null
          supervisor_empleado_id?: string | null
          telefono?: string | null
          updated_at?: string
          zona?: string | null
        }
        Update: {
          anios_laborando?: number | null
          checklist_baja?: Json
          codigo_postal?: string | null
          correo_electronico?: string | null
          created_at?: string
          curp?: string | null
          domicilio_completo?: string | null
          edad?: number | null
          estatus_laboral?: string
          estado_civil?: string | null
          expediente_estado?: string
          expediente_observaciones?: string | null
          expediente_validado_en?: string | null
          expediente_validado_por_usuario_id?: string | null
          fecha_alta?: string | null
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          id?: string
          id_nomina?: string | null
          imss_estado?: string
          imss_fecha_alta?: string | null
          imss_fecha_solicitud?: string | null
          imss_observaciones?: string | null
          metadata?: Json
          motivo_baja?: string | null
          nombre_completo?: string
          nss?: string | null
          originario?: string | null
          puesto?: string
          rfc?: string | null
          sbc_diario?: number | null
          sexo?: string | null
          sueldo_base_mensual?: number | null
          supervisor_empleado_id?: string | null
          telefono?: string | null
          updated_at?: string
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleado_expediente_validado_por_usuario_id_fkey"
            columns: ["expediente_validado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleado_supervisor_empleado_id_fkey"
            columns: ["supervisor_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
        ]
      }
      empleado_documento: {
        Row: {
          archivo_hash_id: string
          categoria: string
          creado_por_usuario_id: string | null
          created_at: string
          empleado_id: string
          estado_documento: string
          id: string
          metadata: Json
          mime_type: string | null
          nombre_archivo_original: string
          ocr_provider: string | null
          ocr_resultado: Json
          tamano_bytes: number | null
          tipo_documento: string
          updated_at: string
        }
        Insert: {
          archivo_hash_id: string
          categoria: string
          creado_por_usuario_id?: string | null
          created_at?: string
          empleado_id: string
          estado_documento?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          nombre_archivo_original: string
          ocr_provider?: string | null
          ocr_resultado?: Json
          tamano_bytes?: number | null
          tipo_documento: string
          updated_at?: string
        }
        Update: {
          archivo_hash_id?: string
          categoria?: string
          creado_por_usuario_id?: string | null
          created_at?: string
          empleado_id?: string
          estado_documento?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          nombre_archivo_original?: string
          ocr_provider?: string | null
          ocr_resultado?: Json
          tamano_bytes?: number | null
          tipo_documento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empleado_documento_archivo_hash_id_fkey"
            columns: ["archivo_hash_id"]
            isOneToOne: false
            referencedRelation: "archivo_hash"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleado_documento_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleado_documento_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
        ]
      }
      formacion_asistencia: {
        Row: {
          comentarios: string | null
          confirmado: boolean
          created_at: string
          cuenta_cliente_id: string
          empleado_id: string
          estado: string
          evento_id: string
          evidencias: Json
          id: string
          metadata: Json
          participante_nombre: string
          presente: boolean
          puesto: string | null
          updated_at: string
        }
        Insert: {
          comentarios?: string | null
          confirmado?: boolean
          created_at?: string
          cuenta_cliente_id: string
          empleado_id: string
          estado?: string
          evento_id: string
          evidencias?: Json
          id?: string
          metadata?: Json
          participante_nombre: string
          presente?: boolean
          puesto?: string | null
          updated_at?: string
        }
        Update: {
          comentarios?: string | null
          confirmado?: boolean
          created_at?: string
          cuenta_cliente_id?: string
          empleado_id?: string
          estado?: string
          evento_id?: string
          evidencias?: Json
          id?: string
          metadata?: Json
          participante_nombre?: string
          presente?: boolean
          puesto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formacion_asistencia_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formacion_asistencia_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "formacion_asistencia_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formacion_asistencia_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "formacion_evento"
            referencedColumns: ["id"]
          },
        ]
      }
      formacion_evento: {
        Row: {
          ciudad: string | null
          created_at: string
          created_by_usuario_id: string | null
          cuenta_cliente_id: string
          descripcion: string | null
          estado: string
          fecha_fin: string
          fecha_inicio: string
          gastos_operativos: Json
          id: string
          metadata: Json
          nombre: string
          notificaciones: Json
          participantes: Json
          responsable_empleado_id: string | null
          sede: string
          tipo: string
          updated_at: string
          updated_by_usuario_id: string | null
        }
        Insert: {
          ciudad?: string | null
          created_at?: string
          created_by_usuario_id?: string | null
          cuenta_cliente_id: string
          descripcion?: string | null
          estado?: string
          fecha_fin: string
          fecha_inicio: string
          gastos_operativos?: Json
          id?: string
          metadata?: Json
          nombre: string
          notificaciones?: Json
          participantes?: Json
          responsable_empleado_id?: string | null
          sede: string
          tipo?: string
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Update: {
          ciudad?: string | null
          created_at?: string
          created_by_usuario_id?: string | null
          cuenta_cliente_id?: string
          descripcion?: string | null
          estado?: string
          fecha_fin?: string
          fecha_inicio?: string
          gastos_operativos?: Json
          id?: string
          metadata?: Json
          nombre?: string
          notificaciones?: Json
          participantes?: Json
          responsable_empleado_id?: string | null
          sede?: string
          tipo?: string
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formacion_evento_created_by_usuario_id_fkey"
            columns: ["created_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formacion_evento_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formacion_evento_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "formacion_evento_responsable_empleado_id_fkey"
            columns: ["responsable_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formacion_evento_updated_by_usuario_id_fkey"
            columns: ["updated_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      geocerca_pdv: {
        Row: {
          created_at: string
          id: string
          latitud: number
          longitud: number
          pdv_id: string
          permite_checkin_con_justificacion: boolean
          radio_tolerancia_metros: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitud: number
          longitud: number
          pdv_id: string
          permite_checkin_con_justificacion?: boolean
          radio_tolerancia_metros?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitud?: number
          longitud?: number
          pdv_id?: string
          permite_checkin_con_justificacion?: boolean
          radio_tolerancia_metros?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geocerca_pdv_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: true
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
        ]
      }
      horario_pdv: {
        Row: {
          activo: boolean
          codigo_turno: string | null
          created_at: string
          dia_semana: number | null
          fecha_especifica: string | null
          hora_entrada: string | null
          hora_salida: string | null
          id: string
          nivel_prioridad: number
          observaciones: string | null
          pdv_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo_turno?: string | null
          created_at?: string
          dia_semana?: number | null
          fecha_especifica?: string | null
          hora_entrada?: string | null
          hora_salida?: string | null
          id?: string
          nivel_prioridad: number
          observaciones?: string | null
          pdv_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo_turno?: string | null
          created_at?: string
          dia_semana?: number | null
          fecha_especifica?: string | null
          hora_entrada?: string | null
          hora_salida?: string | null
          id?: string
          nivel_prioridad?: number
          observaciones?: string | null
          pdv_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horario_pdv_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
        ]
      }
      mision_dia: {
        Row: {
          activa: boolean
          codigo: string | null
          created_at: string
          id: string
          instruccion: string
          orden: number | null
          peso: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          codigo?: string | null
          created_at?: string
          id?: string
          instruccion: string
          orden?: number | null
          peso?: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          codigo?: string | null
          created_at?: string
          id?: string
          instruccion?: string
          orden?: number | null
          peso?: number
          updated_at?: string
        }
        Relationships: []
      }
      nomina_ledger: {
        Row: {
          concepto: string
          created_at: string
          cuenta_cliente_id: string | null
          empleado_id: string
          id: string
          metadata: Json
          moneda: string
          monto: number
          notas: string | null
          periodo_id: string
          referencia_id: string | null
          referencia_tabla: string | null
          tipo_movimiento: string
          updated_at: string
        }
        Insert: {
          concepto: string
          created_at?: string
          cuenta_cliente_id?: string | null
          empleado_id: string
          id?: string
          metadata?: Json
          moneda?: string
          monto: number
          notas?: string | null
          periodo_id: string
          referencia_id?: string | null
          referencia_tabla?: string | null
          tipo_movimiento: string
          updated_at?: string
        }
        Update: {
          concepto?: string
          created_at?: string
          cuenta_cliente_id?: string | null
          empleado_id?: string
          id?: string
          metadata?: Json
          moneda?: string
          monto?: number
          notas?: string | null
          periodo_id?: string
          referencia_id?: string | null
          referencia_tabla?: string | null
          tipo_movimiento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nomina_ledger_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomina_ledger_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "nomina_ledger_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomina_ledger_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "nomina_periodo"
            referencedColumns: ["id"]
          },
        ]
      }
      nomina_periodo: {
        Row: {
          clave: string
          created_at: string
          estado: string
          fecha_cierre: string | null
          fecha_fin: string
          fecha_inicio: string
          id: string
          metadata: Json
          observaciones: string | null
          updated_at: string
        }
        Insert: {
          clave: string
          created_at?: string
          estado?: string
          fecha_cierre?: string | null
          fecha_fin: string
          fecha_inicio: string
          id?: string
          metadata?: Json
          observaciones?: string | null
          updated_at?: string
        }
        Update: {
          clave?: string
          created_at?: string
          estado?: string
          fecha_cierre?: string | null
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          metadata?: Json
          observaciones?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pdv: {
        Row: {
          cadena_id: string | null
          ciudad_id: string | null
          clave_btl: string
          created_at: string
          direccion: string | null
          estatus: string
          formato: string | null
          horario_entrada: string | null
          horario_salida: string | null
          id: string
          id_cadena: string | null
          metadata: Json
          nombre: string
          updated_at: string
          zona: string | null
        }
        Insert: {
          cadena_id?: string | null
          ciudad_id?: string | null
          clave_btl: string
          created_at?: string
          direccion?: string | null
          estatus?: string
          formato?: string | null
          horario_entrada?: string | null
          horario_salida?: string | null
          id?: string
          id_cadena?: string | null
          metadata?: Json
          nombre: string
          updated_at?: string
          zona?: string | null
        }
        Update: {
          cadena_id?: string | null
          ciudad_id?: string | null
          clave_btl?: string
          created_at?: string
          direccion?: string | null
          estatus?: string
          formato?: string | null
          horario_entrada?: string | null
          horario_salida?: string | null
          id?: string
          id_cadena?: string | null
          metadata?: Json
          nombre?: string
          updated_at?: string
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_cadena_id_fkey"
            columns: ["cadena_id"]
            isOneToOne: false
            referencedRelation: "cadena"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_ciudad_id_fkey"
            columns: ["ciudad_id"]
            isOneToOne: false
            referencedRelation: "ciudad"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_cobertura_operativa: {
        Row: {
          acceso_pendiente_desde: string | null
          apartado_por_usuario_id: string | null
          created_at: string
          cuenta_cliente_id: string
          empleado_reservado_id: string | null
          estado_operativo: string
          id: string
          metadata: Json
          motivo_operativo: string | null
          observaciones: string | null
          pdv_id: string
          pdv_paso_id: string | null
          proximo_recordatorio_at: string | null
          updated_at: string
        }
        Insert: {
          acceso_pendiente_desde?: string | null
          apartado_por_usuario_id?: string | null
          created_at?: string
          cuenta_cliente_id: string
          empleado_reservado_id?: string | null
          estado_operativo?: string
          id?: string
          metadata?: Json
          motivo_operativo?: string | null
          observaciones?: string | null
          pdv_id: string
          pdv_paso_id?: string | null
          proximo_recordatorio_at?: string | null
          updated_at?: string
        }
        Update: {
          acceso_pendiente_desde?: string | null
          apartado_por_usuario_id?: string | null
          created_at?: string
          cuenta_cliente_id?: string
          empleado_reservado_id?: string | null
          estado_operativo?: string
          id?: string
          metadata?: Json
          motivo_operativo?: string | null
          observaciones?: string | null
          pdv_id?: string
          pdv_paso_id?: string | null
          proximo_recordatorio_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_cobertura_operativa_apartado_por_usuario_id_fkey"
            columns: ["apartado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_cobertura_operativa_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_cobertura_operativa_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "pdv_cobertura_operativa_empleado_reservado_id_fkey"
            columns: ["empleado_reservado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_cobertura_operativa_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_cobertura_operativa_pdv_paso_id_fkey"
            columns: ["pdv_paso_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_rotacion_maestra: {
        Row: {
          clasificacion_maestra: string
          created_at: string
          cuenta_cliente_id: string
          fuente: string
          grupo_rotacion_codigo: string | null
          grupo_tamano: number | null
          id: string
          metadata: Json
          observaciones: string | null
          pdv_id: string
          slot_rotacion: string | null
          updated_at: string
          vigente: boolean
        }
        Insert: {
          clasificacion_maestra: string
          created_at?: string
          cuenta_cliente_id: string
          fuente?: string
          grupo_rotacion_codigo?: string | null
          grupo_tamano?: number | null
          id?: string
          metadata?: Json
          observaciones?: string | null
          pdv_id: string
          slot_rotacion?: string | null
          updated_at?: string
          vigente?: boolean
        }
        Update: {
          clasificacion_maestra?: string
          created_at?: string
          cuenta_cliente_id?: string
          fuente?: string
          grupo_rotacion_codigo?: string | null
          grupo_tamano?: number | null
          id?: string
          metadata?: Json
          observaciones?: string | null
          pdv_id?: string
          slot_rotacion?: string | null
          updated_at?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pdv_rotacion_maestra_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_rotacion_maestra_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "pdv_rotacion_maestra_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
        ]
      }
      producto: {
        Row: {
          activo: boolean
          categoria: string
          created_at: string
          id: string
          metadata: Json
          nombre: string
          nombre_corto: string
          sku: string
          top_30: boolean
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria: string
          created_at?: string
          id?: string
          metadata?: Json
          nombre: string
          nombre_corto: string
          sku: string
          top_30?: boolean
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          created_at?: string
          id?: string
          metadata?: Json
          nombre?: string
          nombre_corto?: string
          sku?: string
          top_30?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      regla_negocio: {
        Row: {
          accion: Json
          activa: boolean
          codigo: string
          condicion: Json
          created_at: string
          descripcion: string
          id: string
          modulo: string
          prioridad: number
          severidad: string
          updated_at: string
        }
        Insert: {
          accion?: Json
          activa?: boolean
          codigo: string
          condicion?: Json
          created_at?: string
          descripcion: string
          id?: string
          modulo: string
          prioridad?: number
          severidad: string
          updated_at?: string
        }
        Update: {
          accion?: Json
          activa?: boolean
          codigo?: string
          condicion?: Json
          created_at?: string
          descripcion?: string
          id?: string
          modulo?: string
          prioridad?: number
          severidad?: string
          updated_at?: string
        }
        Relationships: []
      }
      ruta_semanal: {
        Row: {
          created_at: string
          created_by_usuario_id: string | null
          cuenta_cliente_id: string
          estatus: string
          id: string
          notas: string | null
          semana_inicio: string
          supervisor_empleado_id: string
          updated_at: string
          updated_by_usuario_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_usuario_id?: string | null
          cuenta_cliente_id: string
          estatus?: string
          id?: string
          notas?: string | null
          semana_inicio: string
          supervisor_empleado_id: string
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_usuario_id?: string | null
          cuenta_cliente_id?: string
          estatus?: string
          id?: string
          notas?: string | null
          semana_inicio?: string
          supervisor_empleado_id?: string
          updated_at?: string
          updated_by_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ruta_semanal_created_by_usuario_id_fkey"
            columns: ["created_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_semanal_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_semanal_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "ruta_semanal_supervisor_empleado_id_fkey"
            columns: ["supervisor_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_semanal_updated_by_usuario_id_fkey"
            columns: ["updated_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      ruta_semanal_visita: {
        Row: {
          asignacion_id: string | null
          checklist_calidad: Json
          comentarios: string | null
          completada_en: string | null
          created_at: string
          cuenta_cliente_id: string
          dia_semana: number
          estatus: string
          evidencia_hash: string | null
          evidencia_url: string | null
          id: string
          metadata: Json
          orden: number
          pdv_id: string
          ruta_semanal_id: string
          selfie_hash: string | null
          selfie_url: string | null
          supervisor_empleado_id: string
          updated_at: string
        }
        Insert: {
          asignacion_id?: string | null
          checklist_calidad?: Json
          comentarios?: string | null
          completada_en?: string | null
          created_at?: string
          cuenta_cliente_id: string
          dia_semana: number
          estatus?: string
          evidencia_hash?: string | null
          evidencia_url?: string | null
          id?: string
          metadata?: Json
          orden: number
          pdv_id: string
          ruta_semanal_id: string
          selfie_hash?: string | null
          selfie_url?: string | null
          supervisor_empleado_id: string
          updated_at?: string
        }
        Update: {
          asignacion_id?: string | null
          checklist_calidad?: Json
          comentarios?: string | null
          completada_en?: string | null
          created_at?: string
          cuenta_cliente_id?: string
          dia_semana?: number
          estatus?: string
          evidencia_hash?: string | null
          evidencia_url?: string | null
          id?: string
          metadata?: Json
          orden?: number
          pdv_id?: string
          ruta_semanal_id?: string
          selfie_hash?: string | null
          selfie_url?: string | null
          supervisor_empleado_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruta_semanal_visita_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_semanal_visita_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_semanal_visita_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "ruta_semanal_visita_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_semanal_visita_ruta_semanal_id_fkey"
            columns: ["ruta_semanal_id"]
            isOneToOne: false
            referencedRelation: "ruta_semanal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_semanal_visita_supervisor_empleado_id_fkey"
            columns: ["supervisor_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_pdv: {
        Row: {
          activo: boolean
          created_at: string
          empleado_id: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          pdv_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empleado_id: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          pdv_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empleado_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          pdv_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_pdv_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_pdv_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario: {
        Row: {
          auth_user_id: string | null
          correo_electronico: string | null
          correo_verificado: boolean
          created_at: string
          cuenta_cliente_id: string | null
          empleado_id: string
          estado_cuenta: string
          id: string
          password_temporal_expira_en: string | null
          password_temporal_generada_en: string | null
          ultimo_acceso_en: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          correo_electronico?: string | null
          correo_verificado?: boolean
          created_at?: string
          cuenta_cliente_id?: string | null
          empleado_id: string
          estado_cuenta?: string
          id?: string
          password_temporal_expira_en?: string | null
          password_temporal_generada_en?: string | null
          ultimo_acceso_en?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          correo_electronico?: string | null
          correo_verificado?: boolean
          created_at?: string
          cuenta_cliente_id?: string | null
          empleado_id?: string
          estado_cuenta?: string
          id?: string
          password_temporal_expira_en?: string | null
          password_temporal_generada_en?: string | null
          ultimo_acceso_en?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuario_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "usuario_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
        ]
      }
      venta: {
        Row: {
          asistencia_id: string
          confirmada: boolean
          created_at: string
          cuenta_cliente_id: string
          empleado_id: string
          fecha_utc: string
          id: string
          metadata: Json
          observaciones: string | null
          origen: string
          pdv_id: string
          producto_id: string | null
          producto_nombre: string
          producto_nombre_corto: string | null
          producto_sku: string | null
          total_monto: number
          total_unidades: number
          updated_at: string
          validada_en: string | null
          validada_por_empleado_id: string | null
        }
        Insert: {
          asistencia_id: string
          confirmada?: boolean
          created_at?: string
          cuenta_cliente_id: string
          empleado_id: string
          fecha_utc?: string
          id?: string
          metadata?: Json
          observaciones?: string | null
          origen?: string
          pdv_id: string
          producto_id?: string | null
          producto_nombre: string
          producto_nombre_corto?: string | null
          producto_sku?: string | null
          total_monto?: number
          total_unidades: number
          updated_at?: string
          validada_en?: string | null
          validada_por_empleado_id?: string | null
        }
        Update: {
          asistencia_id?: string
          confirmada?: boolean
          created_at?: string
          cuenta_cliente_id?: string
          empleado_id?: string
          fecha_utc?: string
          id?: string
          metadata?: Json
          observaciones?: string | null
          origen?: string
          pdv_id?: string
          producto_id?: string | null
          producto_nombre?: string
          producto_nombre_corto?: string | null
          producto_sku?: string | null
          total_monto?: number
          total_unidades?: number
          updated_at?: string
          validada_en?: string | null
          validada_por_empleado_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venta_asistencia_id_fkey"
            columns: ["asistencia_id"]
            isOneToOne: false
            referencedRelation: "asistencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_cuenta_cliente_id_fkey"
            columns: ["cuenta_cliente_id"]
            isOneToOne: false
            referencedRelation: "dashboard_kpis"
            referencedColumns: ["cuenta_cliente_id"]
          },
          {
            foreignKeyName: "venta_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_validada_por_empleado_id_fkey"
            columns: ["validada_por_empleado_id"]
            isOneToOne: false
            referencedRelation: "empleado"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dashboard_kpis: {
        Row: {
          afiliaciones_love: number | null
          alertas_operativas: number | null
          asistencia_porcentaje: number | null
          checkins_validos: number | null
          cuenta_cliente: string | null
          cuenta_cliente_id: string | null
          cuenta_cliente_identificador: string | null
          cuotas_cumplidas_periodo: number | null
          fecha_corte: string | null
          jornadas_operadas: number | null
          jornadas_pendientes: number | null
          monto_confirmado: number | null
          neto_nomina_periodo: number | null
          promotores_activos: number | null
          refreshed_at: string | null
          ventas_confirmadas: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_auth_sessions: {
        Args: never
        Returns: {
          aal: string
          auth_user_id: string
          created_at: string
          ip: string
          is_active: boolean
          not_after: string
          refreshed_at: string
          session_id: string
          tag: string
          updated_at: string
          user_agent: string
        }[]
      }
      calcular_hash_sha256: { Args: { payload: Json }; Returns: string }
      construir_claims_usuario: {
        Args: { p_auth_user_id: string }
        Returns: Json
      }
      es_administrador: { Args: never; Returns: boolean }
      es_cliente: { Args: never; Returns: boolean }
      es_operador_nomina: { Args: never; Returns: boolean }
      es_reclutamiento_nomina_o_admin: { Args: never; Returns: boolean }
      es_reclutamiento_o_admin: { Args: never; Returns: boolean }
      es_usuario_interno: { Args: never; Returns: boolean }
      get_my_cuenta_cliente_id: { Args: never; Returns: string }
      get_my_empleado_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      jwt_claim_text: { Args: { clave: string }; Returns: string }
      jwt_cuenta_cliente_id: { Args: never; Returns: string }
      jwt_rol: { Args: never; Returns: string }
      refrescar_claims_auth_user: {
        Args: { p_auth_user_id: string }
        Returns: undefined
      }
      refresh_dashboard_kpis: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
