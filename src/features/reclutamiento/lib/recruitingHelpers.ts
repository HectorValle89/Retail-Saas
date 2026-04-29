import type { EmpleadoOcrSnapshot } from '@/features/empleados/state'

export interface CrearEmpleadoDraft {
  nombre_completo: string
  curp: string
  nss: string
  rfc: string
  puesto: string
  zona: string
  telefono: string
  correo_electronico: string
  fecha_alta: string
  fecha_nacimiento: string
  domicilio_completo: string
  codigo_postal: string
  edad: string
  sexo: string
  estado_civil: string
  originario: string
  pdv_objetivo_id: string
  coordinador_empleado_id: string
  fecha_ingreso_oficial: string
  fecha_isdinizacion: string
  accesos_externos_status: string
  accesos_externos_observaciones: string
  expediente_completo_recibido: boolean
  contrato_status: string
  contrato_firmado_en: string
}

export interface OcrPreviewResponse {
  message?: string
  snapshot?: EmpleadoOcrSnapshot
}

export function createInitialEmpleadoDraft(): CrearEmpleadoDraft {
  const today = new Date().toISOString().slice(0, 10)

  return {
    nombre_completo: '',
    curp: '',
    nss: '',
    rfc: '',
    puesto: 'DERMOCONSEJERO',
    zona: '',
    telefono: '',
    correo_electronico: '',
    fecha_alta: today,
    fecha_nacimiento: '',
    domicilio_completo: '',
    codigo_postal: '',
    edad: '',
    sexo: '',
    estado_civil: '',
    originario: '',
    pdv_objetivo_id: '',
    coordinador_empleado_id: '',
    fecha_ingreso_oficial: today,
    fecha_isdinizacion: '',
    accesos_externos_status: 'PENDIENTE',
    accesos_externos_observaciones: '',
    expediente_completo_recibido: true,
    contrato_status: 'PENDIENTE',
    contrato_firmado_en: '',
  }
}

export function normalizeUppercaseTextInput(value: string) {
  return value.toLocaleUpperCase('es-MX')
}

export function applyOcrSnapshotToDraft(
  current: CrearEmpleadoDraft,
  snapshot: EmpleadoOcrSnapshot
): CrearEmpleadoDraft {
  return {
    ...current,
    nombre_completo: snapshot.nombreCompleto ?? current.nombre_completo,
    curp: snapshot.curp ?? current.curp,
    nss: snapshot.nss ?? current.nss,
    rfc: snapshot.rfc ?? current.rfc,
    telefono: snapshot.telefono ?? current.telefono,
    correo_electronico: snapshot.correoElectronico ?? current.correo_electronico,
    fecha_nacimiento: snapshot.fechaNacimiento ?? current.fecha_nacimiento,
    domicilio_completo: snapshot.direccion ?? current.domicilio_completo,
    codigo_postal: snapshot.codigoPostal ?? current.codigo_postal,
    edad: snapshot.edad !== null ? String(snapshot.edad) : current.edad,
    sexo: snapshot.sexo ?? current.sexo,
    estado_civil: snapshot.estadoCivil ?? current.estado_civil,
    originario: snapshot.originario ?? current.originario,
  }
}

export async function readJsonResponseSafely(response: Response): Promise<OcrPreviewResponse> {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return {
      message: response.ok
        ? 'La ruta OCR no devolvio contenido.'
        : 'La ruta OCR devolvio una respuesta vacia.',
    }
  }

  try {
    return JSON.parse(rawText) as OcrPreviewResponse
  } catch {
    return {
      message: response.ok
        ? 'La respuesta OCR no pudo interpretarse.'
        : `La ruta OCR devolvio una respuesta no JSON (HTTP ${response.status}).`,
    }
  }
}
