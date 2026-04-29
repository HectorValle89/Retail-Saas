import 'server-only'
import { TypedSupabaseClient } from '@/lib/supabase/server'
import { WorkflowNotificationRecipient } from './types'
import type { Empleado, Puesto } from '@/types/database'

type EmpleadoRecipientRow = Pick<
  Empleado,
  'id' | 'nombre_completo' | 'puesto' | 'correo_electronico' | 'estatus_laboral'
>

type UsuarioRecipientRow = {
  empleado_id: string
  cuenta_cliente_id: string | null
  estado_cuenta: string
  correo_electronico: string | null
  empleado: EmpleadoRecipientRow | EmpleadoRecipientRow[] | null
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function buildRecipientFromUser(row: UsuarioRecipientRow): WorkflowNotificationRecipient | null {
  const empleado = firstRelation(row.empleado)
  if (!empleado || empleado.estatus_laboral !== 'ACTIVO') return null

  const email = empleado.correo_electronico?.trim() || row.correo_electronico?.trim()
  if (!email) return null

  return {
    email,
    name: empleado.nombre_completo,
    empleadoId: empleado.id,
    cuentaClienteId: row.cuenta_cliente_id,
    puesto: empleado.puesto,
  }
}

function isTargetRole(puesto: Puesto) {
  return puesto === 'COORDINADOR' || puesto === 'ADMINISTRADOR'
}

export async function getCoordinadoresYAdmin(
  supabase: TypedSupabaseClient,
  cuentaClienteId: string | null
): Promise<WorkflowNotificationRecipient[]> {
  const { data: usuarios } = await supabase
    .from('usuario')
    .select('empleado_id, cuenta_cliente_id, estado_cuenta, correo_electronico, empleado:empleado_id(id, nombre_completo, puesto, correo_electronico, estatus_laboral)')
    .eq('estado_cuenta', 'ACTIVA')
    .or(cuentaClienteId ? `cuenta_cliente_id.eq.${cuentaClienteId},cuenta_cliente_id.is.null` : 'cuenta_cliente_id.is.null')

  if (!usuarios) return []

  const recipients: WorkflowNotificationRecipient[] = []
  const seenIds = new Set<string>()

  for (const usuario of usuarios as UsuarioRecipientRow[]) {
    const recipient = buildRecipientFromUser(usuario)
    if (!recipient?.empleadoId || !recipient.puesto || !isTargetRole(recipient.puesto)) continue
    if (seenIds.has(recipient.empleadoId)) continue

    recipients.push(recipient)
    seenIds.add(recipient.empleadoId)
  }

  return recipients
}

export async function getSupervisorEmail(
  supabase: TypedSupabaseClient,
  supervisorEmpleadoId: string
): Promise<WorkflowNotificationRecipient | null> {
  const { data: emp } = await supabase
    .from('empleado')
    .select('id, nombre_completo, puesto, correo_electronico')
    .eq('id', supervisorEmpleadoId)
    .single()

  if (!emp || !emp.correo_electronico) {
    const { data: user } = await supabase
      .from('usuario')
      .select('correo_electronico, cuenta_cliente_id')
      .eq('empleado_id', supervisorEmpleadoId)
      .eq('estado_cuenta', 'ACTIVA')
      .maybeSingle()
    
    if (!user || !user.correo_electronico) return null
    
    return {
      email: user.correo_electronico,
      name: emp?.nombre_completo || 'Supervisor',
      empleadoId: supervisorEmpleadoId,
      cuentaClienteId: user.cuenta_cliente_id,
      puesto: emp?.puesto || 'SUPERVISOR'
    }
  }

  const { data: user } = await supabase
    .from('usuario')
    .select('cuenta_cliente_id')
    .eq('empleado_id', supervisorEmpleadoId)
    .eq('estado_cuenta', 'ACTIVA')
    .maybeSingle()

  return {
    email: emp.correo_electronico,
    name: emp.nombre_completo,
    empleadoId: emp.id,
    cuentaClienteId: user?.cuenta_cliente_id ?? null,
    puesto: emp.puesto
  }
}

export async function getEmpleadoEmail(
  supabase: TypedSupabaseClient,
  empleadoId: string
): Promise<WorkflowNotificationRecipient | null> {
  const { data: emp } = await supabase
    .from('empleado')
    .select('id, nombre_completo, puesto, correo_electronico')
    .eq('id', empleadoId)
    .single()

  if (!emp) return null

  let email = emp.correo_electronico
  let cuentaClienteId: string | null = null
  if (!email) {
    const { data: user } = await supabase
      .from('usuario')
      .select('correo_electronico, cuenta_cliente_id')
      .eq('empleado_id', empleadoId)
      .eq('estado_cuenta', 'ACTIVA')
      .maybeSingle()
    email = user?.correo_electronico || null
    cuentaClienteId = user?.cuenta_cliente_id ?? null
  } else {
    const { data: user } = await supabase
      .from('usuario')
      .select('cuenta_cliente_id')
      .eq('empleado_id', empleadoId)
      .eq('estado_cuenta', 'ACTIVA')
      .maybeSingle()
    cuentaClienteId = user?.cuenta_cliente_id ?? null
  }

  if (!email) return null

  return {
    email,
    name: emp.nombre_completo,
    empleadoId: emp.id,
    cuentaClienteId,
    puesto: emp.puesto
  }
}

export async function getTodosEmpleadosActivos(
  supabase: TypedSupabaseClient,
  cuentaClienteId: string
): Promise<WorkflowNotificationRecipient[]> {
  const { data: usuarios } = await supabase
    .from('usuario')
    .select('empleado_id, cuenta_cliente_id, estado_cuenta, correo_electronico, empleado:empleado_id(id, nombre_completo, puesto, correo_electronico, estatus_laboral)')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('estado_cuenta', 'ACTIVA')

  if (!usuarios) return []

  const recipients: WorkflowNotificationRecipient[] = []
  for (const usuario of usuarios as UsuarioRecipientRow[]) {
    const recipient = buildRecipientFromUser(usuario)
    if (recipient) {
      recipients.push({
        ...recipient,
        cuentaClienteId,
      })
    }
  }

  return recipients
}
