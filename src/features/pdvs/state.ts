export type PdvCreateDraft = {
  clave_btl: string
  nombre: string
  cadena_id: string
  ciudad_id: string
  zona: string
  direccion: string
  formato: string
  id_cadena: string
  estatus: 'ACTIVO' | 'TEMPORAL' | 'INACTIVO'
  coordenadas: string
  radio_tolerancia_metros: string
  permite_checkin_con_justificacion: boolean
  supervisor_empleado_id: string
  horario_mode: 'CADENA' | 'PERSONALIZADO'
  turno_nomenclatura: string
  hora_entrada: string
  hora_salida: string
  horario_observaciones: string
}

export type PdvActionState = {
  ok: boolean
  message: string | null
  fields?: PdvCreateDraft | null
}

export const ESTADO_PDV_INICIAL: PdvActionState = {
  ok: false,
  message: null,
  fields: null,
}
