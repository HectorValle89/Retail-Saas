'use server'

import { createClient } from '@/lib/supabase/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import type { AsignacionDiariaResuelta } from '@/types/database'

/**
 * Obtiene los cambios (deltas) en las asignaciones materializadas desde un momento específico.
 * Este endpoint es vital para la sincronización silenciosa en dispositivos móviles.
 * 
 * @param lastRefreshedAt Timestamp ISO de la última sincronización exitosa.
 */
export async function getAsignacionesDelta(lastRefreshedAt: string | null) {
  // Validamos que sea un usuario activo con acceso al sistema
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR', 'DERMOCONSEJERO'])
  const supabase = await createClient()

  // Construimos la consulta base filtrada por la cuenta del cliente (Aislamiento Multi-tenant)
  let query = supabase
    .from('asignacion_diaria_resuelta')
    .select('*')
    .eq('cuenta_cliente_id', actor.cuentaClienteId)

  // Filtramos según el rol para no descargar datos innecesarios
  if (actor.puesto === 'DERMOCONSEJERO') {
    // La DC solo necesita sus propias asignaciones
    query = query.eq('empleado_id', actor.empleadoId)
  } else if (actor.puesto === 'SUPERVISOR') {
    // El supervisor necesita las suyas y las de su equipo directo
    query = query.or(`empleado_id.eq.${actor.empleadoId},supervisor_empleado_id.eq.${actor.empleadoId}`)
  }
  // COORDINADOR y ADMINISTRADOR ven todo lo de su cuenta (ya filtrado arriba)

  // Solo traemos lo que ha cambiado desde la última vez (validamos formato ISO básico)
  if (lastRefreshedAt && /^\d{4}-\d{2}-\d{2}/.test(lastRefreshedAt)) {
    query = query.gt('refreshed_at', lastRefreshedAt)
  }

  // Limitamos el horizonte operativo (por ejemplo, desde hace 2 días hasta 14 días al futuro)
  // para evitar que deltas históricos muy viejos saturen el dispositivo.
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 2)
  const futureLimit = new Date(today)
  futureLimit.setDate(today.getDate() + 14)

  query = query
    .gte('fecha', yesterday.toISOString().split('T')[0])
    .lte('fecha', futureLimit.toISOString().split('T')[0])

  const { data, error } = await query.order('refreshed_at', { ascending: true })

  if (error) {
    console.error('[getAsignacionesDelta] Error al consultar deltas:', error)
    throw new Error('No se pudieron recuperar los cambios en las asignaciones.')
  }

  return (data ?? []) as AsignacionDiariaResuelta[]
}
