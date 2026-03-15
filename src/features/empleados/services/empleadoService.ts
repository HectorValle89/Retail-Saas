import type { SupabaseClient } from '@supabase/supabase-js'

export interface EmpleadoResumen {
  total: number
  activos: number
  supervisores: number
  dermoconsejeros: number
}

export interface EmpleadoListadoItem {
  id: string
  nombreCompleto: string
  puesto: string
  zona: string | null
  correoElectronico: string | null
  telefono: string | null
  estatusLaboral: string
}

export interface EmpleadosPanelData {
  resumen: EmpleadoResumen
  empleados: EmpleadoListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

export async function obtenerPanelEmpleados(
  supabase: SupabaseClient
): Promise<EmpleadosPanelData> {
  const { data, error } = await supabase
    .from('empleado')
    .select('id, nombre_completo, puesto, zona, correo_electronico, telefono, estatus_laboral')
    .order('created_at', { ascending: false })
    .limit(12)

  if (error) {
    return {
      resumen: { total: 0, activos: 0, supervisores: 0, dermoconsejeros: 0 },
      empleados: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `empleado` aun no esta disponible en Supabase. Ejecuta primero las migraciones.',
    }
  }

  const empleados = (data ?? []).map((empleado) => ({
    id: empleado.id,
    nombreCompleto: empleado.nombre_completo,
    puesto: empleado.puesto,
    zona: empleado.zona,
    correoElectronico: empleado.correo_electronico,
    telefono: empleado.telefono,
    estatusLaboral: empleado.estatus_laboral,
  }))

  return {
    resumen: {
      total: empleados.length,
      activos: empleados.filter((item) => item.estatusLaboral === 'ACTIVO').length,
      supervisores: empleados.filter((item) => item.puesto === 'SUPERVISOR').length,
      dermoconsejeros: empleados.filter((item) => item.puesto === 'DERMOCONSEJERO').length,
    },
    empleados,
    infraestructuraLista: true,
  }
}
