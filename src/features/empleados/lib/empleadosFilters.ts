import type { EmpleadoListadoItem } from '../services/empleadoService'

export type EmpleadosImssFilterValue =
  | 'ALL'
  | 'PENDIENTE_IMSS'
  | 'NO_INICIADO'
  | 'PENDIENTE_DOCUMENTOS'
  | 'EN_PROCESO'
  | 'ALTA_IMSS'
  | 'ERROR'

export interface EmpleadosPanelInitialFilters {
  search?: string
  estadoLaboral?: string
  zona?: string
  supervisorId?: string
  imss?: string
  inbox?: string
}

export const IMSS_FILTER_OPTIONS: Array<{ value: EmpleadosImssFilterValue; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDIENTE_IMSS', label: 'Pendiente IMSS' },
  { value: 'NO_INICIADO', label: 'NO_INICIADO' },
  { value: 'PENDIENTE_DOCUMENTOS', label: 'PENDIENTE_DOCUMENTOS' },
  { value: 'EN_PROCESO', label: 'EN_PROCESO' },
  { value: 'ALTA_IMSS', label: 'ALTA_IMSS' },
  { value: 'ERROR', label: 'ERROR' },
]

export function normalizeImssFilterValue(value: string | undefined): EmpleadosImssFilterValue {
  if (!value) {
    return 'ALL'
  }

  const normalized = value.trim().toUpperCase() as EmpleadosImssFilterValue
  return IMSS_FILTER_OPTIONS.some((item) => item.value === normalized) ? normalized : 'ALL'
}

export function filterEmpleadosListado(
  empleados: EmpleadoListadoItem[],
  filters: {
    search: string
    estadoLaboral: string
    zona: string
    supervisorId: string
    imss: EmpleadosImssFilterValue
  }
) {
  const normalizedSearch = filters.search.trim().toLowerCase()

  return empleados.filter((empleado) => {
    const matchSearch = !normalizedSearch
      ? true
      : [
          empleado.nombreCompleto,
          empleado.idNomina,
          empleado.puesto,
          empleado.zona,
          empleado.supervisor,
          empleado.username,
          empleado.curp,
          empleado.rfc,
          empleado.nss,
          empleado.correoElectronico,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch))

    const matchEstado =
      filters.estadoLaboral === 'ALL' ? true : empleado.estatusLaboral === filters.estadoLaboral
    const matchZona =
      filters.zona === 'ALL'
        ? true
        : filters.zona === 'SIN_ZONA'
          ? !empleado.zona
          : empleado.zona === filters.zona
    const matchSupervisor =
      filters.supervisorId === 'ALL'
        ? true
        : filters.supervisorId === 'SIN_SUPERVISOR'
          ? !empleado.supervisorEmpleadoId
          : empleado.supervisorEmpleadoId === filters.supervisorId
    const matchImss =
      filters.imss === 'ALL'
        ? true
        : filters.imss === 'PENDIENTE_IMSS'
          ? empleado.expedienteEstado === 'VALIDADO' && empleado.imssEstado !== 'ALTA_IMSS'
          : empleado.imssEstado === filters.imss

    return matchSearch && matchEstado && matchZona && matchSupervisor && matchImss
  })
}
