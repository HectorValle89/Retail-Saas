export interface EmpleadoOcrSnapshot {
  nombreCompleto: string | null
  curp: string | null
  rfc: string | null
  nss: string | null
  puestoDetectado: string | null
  direccion: string | null
  codigoPostal: string | null
  telefono: string | null
  correoElectronico: string | null
  fechaIngreso: string | null
  fechaNacimiento: string | null
  edad: number | null
  aniosLaborando: number | null
  sexo: string | null
  estadoCivil: string | null
  originario: string | null
  fuenteDireccion: string | null
  confidenceSummary: string | null
  status: string | null
}

export interface EmpleadoActionState {
  ok: boolean
  message: string | null
  generatedUsername: string | null
  temporaryPassword: string | null
  temporaryEmail: string | null
  duplicatedUpload: boolean
  ocrSnapshot: EmpleadoOcrSnapshot | null
}

export interface CoberturaPdvOperativaActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_EMPLEADO_INICIAL: EmpleadoActionState = {
  ok: false,
  message: null,
  generatedUsername: null,
  temporaryPassword: null,
  temporaryEmail: null,
  duplicatedUpload: false,
  ocrSnapshot: null,
}

export const ESTADO_COBERTURA_PDV_OPERATIVA_INICIAL: CoberturaPdvOperativaActionState = {
  ok: false,
  message: null,
}
