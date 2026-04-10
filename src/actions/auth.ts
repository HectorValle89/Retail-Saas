'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isPrimerAccesoPendiente, readPrimerAccesoMetadata, writePrimerAccesoMetadata } from '@/lib/auth/firstAccess'
import { obtenerClienteAdmin, obtenerUrlBaseAplicacion } from '@/lib/auth/admin'
import { createClient } from '@/lib/supabase/server'

type AuthActionState = {
  error: string | null
}

type UsuarioPrimerAccesoRow = {
  id: string
  empleado_id: string
  cuenta_cliente_id: string | null
  auth_user_id: string | null
  username: string | null
  correo_electronico: string | null
  estado_cuenta: string | null
}

type EmpleadoPrimerAccesoRow = {
  id: string
  nombre_completo: string
  puesto: string
  metadata: Record<string, unknown> | null
}

type UsuarioCorreoConflictoRow = {
  id: string
  correo_verificado: boolean | null
  estado_cuenta: string | null
}

async function resolverCorreoDeAcceso(
  acceso: string
): Promise<{ email: string | null; error: string | null }> {
  if (acceso.includes('@')) {
    return { email: acceso.toLowerCase(), error: null }
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return {
      email: null,
      error:
        'El acceso por usuario temporal requiere backend administrativo. Usa tu correo o configura SUPABASE_SERVICE_ROLE_KEY.',
    }
  }

  const { data } = await service
    .from('usuario')
    .select('auth_user_id')
    .eq('username', acceso)
    .maybeSingle()
  const usuario = data as { auth_user_id?: string | null } | null

  if (!usuario?.auth_user_id) {
    return {
      email: null,
      error:
        adminError ??
        'La cuenta todavia no tiene un usuario de acceso provisionado en auth.',
    }
  }

  const { data: usuarioAuth, error: adminGetUserError } = await service.auth.admin.getUserById(
    usuario.auth_user_id
  )

  if (adminGetUserError || !usuarioAuth.user.email) {
    return {
      email: null,
      error: 'No fue posible resolver el correo de acceso para esa cuenta.',
    }
  }

  return { email: usuarioAuth.user.email, error: null }
}

async function obtenerEstadoCuenta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string
) {
  const { data } = await supabase
    .from('usuario')
    .select('estado_cuenta')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  const usuario = data as { estado_cuenta?: string } | null

  return usuario?.estado_cuenta ?? null
}

async function registrarUltimoAcceso(authUserId: string) {
  const { service } = obtenerClienteAdmin()

  if (!service) {
    return
  }

  const now = new Date().toISOString()

  await service
    .from('usuario')
    .update({
      ultimo_acceso_en: now,
      updated_at: now,
    })
    .eq('auth_user_id', authUserId)
}

async function buscarConflictoCorreoVerificado(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    correoElectronico,
    excludeUsuarioId,
  }: {
    correoElectronico: string
    excludeUsuarioId?: string | null
  }
) {
  const normalizedEmail = correoElectronico.trim().toLowerCase()
  if (!normalizedEmail) {
    return null
  }

  let query = service
    .from('usuario')
    .select('id, correo_verificado, estado_cuenta')
    .eq('correo_electronico', normalizedEmail)
    .eq('correo_verificado', true)
    .limit(1)

  if (excludeUsuarioId) {
    query = query.neq('id', excludeUsuarioId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return (data ?? null) as UsuarioCorreoConflictoRow | null
}

async function cargarUsuarioYEmpleadoActual(
  supabase: Awaited<ReturnType<typeof createClient>>,
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, usuario: null, empleado: null, error: 'La sesion actual no es valida.' }
  }

  const { data: usuario } = await service
    .from('usuario')
    .select('id, empleado_id, cuenta_cliente_id, auth_user_id, username, correo_electronico, estado_cuenta')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const usuarioActual = (usuario ?? null) as UsuarioPrimerAccesoRow | null
  if (!usuarioActual) {
    return {
      user,
      usuario: null,
      empleado: null,
      error: 'No existe un usuario operativo asociado a esta sesion.',
    }
  }

  const { data: empleado } = await service
    .from('empleado')
    .select('id, nombre_completo, puesto, metadata')
    .eq('id', usuarioActual.empleado_id)
    .maybeSingle()

  const empleadoActual = (empleado ?? null) as EmpleadoPrimerAccesoRow | null
  if (!empleadoActual) {
    return {
      user,
      usuario: usuarioActual,
      empleado: null,
      error: 'No existe un empleado asociado a la cuenta actual.',
    }
  }

  return {
    user,
    usuario: usuarioActual,
    empleado: empleadoActual,
    error: null,
  }
}

async function registrarAuditLog(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    tabla,
    registroId,
    usuarioId,
    cuentaClienteId,
    payload,
  }: {
    tabla: string
    registroId: string
    usuarioId: string | null
    cuentaClienteId: string | null
    payload: Record<string, unknown>
  }
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: usuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}

async function crearSolicitudCorreccionPrimerAcceso(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    usuarioId,
    usuario,
    empleado,
    detalle,
  }: {
    usuarioId: string
    usuario: UsuarioPrimerAccesoRow
    empleado: EmpleadoPrimerAccesoRow
    detalle: string
  }
) {
  const { data: recipients, error: recipientsError } = await service
    .from('empleado')
    .select('id, nombre_completo, puesto')
    .eq('estatus_laboral', 'ACTIVO')
    .in('puesto', ['ADMINISTRADOR', 'RECLUTAMIENTO'])
    .order('nombre_completo', { ascending: true })

  if (recipientsError) {
    throw recipientsError
  }

  const destinos = (recipients ?? []) as Array<{ id: string; nombre_completo: string; puesto: string }>
  if (destinos.length === 0) {
    return null
  }

  const titulo = 'Primer acceso: solicitud de correccion de datos'
  const cuerpo = `${empleado.nombre_completo} solicito correccion de datos durante su primer acceso. Detalle: ${detalle}`

  const { data: mensaje, error: mensajeError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: usuario.cuenta_cliente_id,
      creado_por_usuario_id: usuarioId,
      titulo,
      cuerpo,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      zona: null,
      supervisor_empleado_id: null,
      opciones_respuesta: [],
      metadata: {
        contexto: 'PRIMER_ACCESO_CORRECCION_DATOS',
        empleado_id: empleado.id,
        empleado_nombre: empleado.nombre_completo,
        puesto: empleado.puesto,
        detalle,
        username: usuario.username,
        correo_actual: usuario.correo_electronico,
        requested_at: new Date().toISOString(),
      },
    })
    .select('id')
    .maybeSingle()

  if (mensajeError || !mensaje?.id) {
    throw mensajeError ?? new Error('No fue posible crear la solicitud de correccion de datos.')
  }

  const { error: receptorError } = await service.from('mensaje_receptor').insert(
    destinos.map((item) => ({
      mensaje_id: mensaje.id,
      cuenta_cliente_id: usuario.cuenta_cliente_id,
      empleado_id: item.id,
      estado: 'PENDIENTE',
      metadata: {
        contexto: 'PRIMER_ACCESO_CORRECCION_DATOS',
        receptor_puesto: item.puesto,
        empleado_nombre: item.nombre_completo,
      },
    }))
  )

  if (receptorError) {
    throw receptorError
  }

  return mensaje.id
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const acceso = String(formData.get('acceso') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!acceso || !password) {
    return { error: 'Ingresa tu correo o usuario y tu contrasena.' }
  }

  const { email, error: resolverError } = await resolverCorreoDeAcceso(acceso)

  if (resolverError) {
    return { error: resolverError }
  }

  if (!email) {
    return { error: 'No encontramos un acceso valido para esa cuenta.' }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No fue posible recuperar la sesion del usuario.' }
  }

  const estadoCuenta = await obtenerEstadoCuenta(supabase, user.id)

  if (!estadoCuenta) {
    await supabase.auth.signOut()
    return { error: 'No existe un usuario operativo vinculado a esta cuenta.' }
  }

  if (estadoCuenta === 'SUSPENDIDA' || estadoCuenta === 'BAJA') {
    await supabase.auth.signOut()
    return { error: 'Tu cuenta no tiene acceso operativo. Contacta al administrador.' }
  }

  await registrarUltimoAcceso(user.id)
  revalidatePath('/', 'layout')

  if (estadoCuenta === 'PROVISIONAL' || estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL') {
    redirect('/activacion')
  }

  redirect('/dashboard')
}

export async function loginWithRedirect(formData: FormData) {
  const result = await login(formData)

  if (result?.error) {
    redirect(`/login?error=${encodeURIComponent(result.error)}`)
  }
}

export async function iniciarActivacionCuenta(formData: FormData) {
  const supabase = await createClient()
  const correoElectronico = String(formData.get('correo_electronico') ?? '')
    .trim()
    .toLowerCase()

  if (!correoElectronico) {
    return { error: 'Ingresa un correo valido para activar la cuenta.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'La sesion actual no es valida.' }
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select('id, estado_cuenta')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!usuario) {
    return { error: 'No existe un usuario operativo asociado a esta sesion.' }
  }

  if (usuario.estado_cuenta === 'SUSPENDIDA' || usuario.estado_cuenta === 'BAJA') {
    return { error: 'La cuenta esta bloqueada y no puede activarse.' }
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError }
  }

  const conflictoCorreo = await buscarConflictoCorreoVerificado(service, {
    correoElectronico,
    excludeUsuarioId: usuario.id,
  })

  if (conflictoCorreo) {
    return {
      error:
        'Ese correo ya pertenece a otra cuenta verificada. Usa un correo distinto o solicita correccion administrativa.',
    }
  }

  const siteUrl = await obtenerUrlBaseAplicacion()

  const { error: authError } = await supabase.auth.updateUser(
    {
      email: correoElectronico,
    },
    {
      emailRedirectTo: `${siteUrl}/update-password`,
    }
  )

  if (authError) {
    return { error: authError.message }
  }

  const { error: usuarioError } = await service
    .from('usuario')
    .update({
      correo_electronico: correoElectronico,
      estado_cuenta: 'PENDIENTE_VERIFICACION_EMAIL',
      updated_at: new Date().toISOString(),
    })
    .eq('id', usuario.id)

  if (usuarioError) {
    return { error: usuarioError.message }
  }

  revalidatePath('/', 'layout')
  redirect('/check-email')
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) {
    return { error: 'Ingresa un correo valido.' }
  }

  const { service } = obtenerClienteAdmin()

  if (service) {
    const { data: usuario } = await service
      .from('usuario')
      .select('estado_cuenta')
      .eq('correo_electronico', email)
      .maybeSingle()

    if (usuario && usuario.estado_cuenta !== 'ACTIVA') {
      return { error: 'Debes completar primero la activacion de la cuenta.' }
    }
  }

  const siteUrl = await obtenerUrlBaseAplicacion()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/update-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const password = String(formData.get('password') ?? '')

  if (password.length < 8) {
    return { error: 'La contrasena debe tener al menos 8 caracteres.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'La sesion actual no es valida.' }
  }

  if (!user.email_confirmed_at) {
    return { error: 'Primero confirma tu correo antes de definir la contrasena.' }
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError }
  }

  const { data: usuario } = await service
    .from('usuario')
    .select('id, empleado_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!usuario) {
    return { error: 'No existe un usuario operativo asociado a esta sesion.' }
  }

  const correoVerificado = String(user.email ?? '')
    .trim()
    .toLowerCase()

  const conflictoCorreo = await buscarConflictoCorreoVerificado(service, {
    correoElectronico: correoVerificado,
    excludeUsuarioId: usuario.id,
  })

  if (conflictoCorreo) {
    return {
      error:
        'Ese correo ya fue verificado por otra persona. Contacta al administrador para corregir tu acceso antes de continuar.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: error.message }
  }

  let primerAccesoPendiente = false

  if (usuario) {
    const now = new Date().toISOString()
    const { data: empleadoActual } = await service
      .from('empleado')
      .select('metadata')
      .eq('id', usuario.empleado_id)
      .maybeSingle()

    primerAccesoPendiente = isPrimerAccesoPendiente(empleadoActual?.metadata)

    await service
      .from('usuario')
      .update({
        estado_cuenta: 'ACTIVA',
        correo_verificado: true,
        correo_electronico: user.email ?? null,
        ultimo_acceso_en: now,
        updated_at: now,
      })
      .eq('id', usuario.id)

    await service
      .from('empleado')
      .update({
        correo_electronico: user.email ?? null,
        updated_at: now,
      })
      .eq('id', usuario.empleado_id)
  }

  revalidatePath('/', 'layout')
  redirect(primerAccesoPendiente ? '/primer-acceso' : '/dashboard')
}

export async function confirmarPrimerAccesoDatos(
  _prevState: AuthActionState,
  _formData: FormData
): Promise<AuthActionState> {
  const supabase = await createClient()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError ?? 'No fue posible acceder al backend administrativo.' }
  }

  const current = await cargarUsuarioYEmpleadoActual(supabase, service)
  if (current.error || !current.usuario || !current.empleado) {
    return { error: current.error ?? 'No fue posible cargar la cuenta actual.' }
  }

  if (current.usuario.estado_cuenta !== 'ACTIVA') {
    return { error: 'Debes completar primero la activacion de la cuenta.' }
  }

  if (!isPrimerAccesoPendiente(current.empleado.metadata)) {
    redirect('/dashboard')
  }

  const now = new Date().toISOString()
  const metadata = writePrimerAccesoMetadata(current.empleado.metadata, {
    required: false,
    estado: 'CONFIRMADO',
    reviewedAt: now,
    correctionRequestedAt: null,
    correctionNote: null,
    correctionMessageId: null,
  })

  const { error: updateError } = await service
    .from('empleado')
    .update({
      metadata,
      updated_at: now,
    })
    .eq('id', current.empleado.id)

  if (updateError) {
    return { error: updateError.message }
  }

  await registrarAuditLog(service, {
    tabla: 'empleado',
    registroId: current.empleado.id,
    usuarioId: current.usuario.id,
    cuentaClienteId: current.usuario.cuenta_cliente_id,
    payload: {
      accion: 'primer_acceso_confirmado',
      empleado_id: current.empleado.id,
    },
  })

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function solicitarCorreccionPrimerAcceso(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const supabase = await createClient()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError ?? 'No fue posible acceder al backend administrativo.' }
  }

  const detalle = String(formData.get('detalle') ?? '').trim()
  if (!detalle) {
    return { error: 'Explica que dato debe corregirse antes de continuar.' }
  }

  const current = await cargarUsuarioYEmpleadoActual(supabase, service)
  if (current.error || !current.usuario || !current.empleado) {
    return { error: current.error ?? 'No fue posible cargar la cuenta actual.' }
  }

  if (current.usuario.estado_cuenta !== 'ACTIVA') {
    return { error: 'Debes completar primero la activacion de la cuenta.' }
  }

  if (!isPrimerAccesoPendiente(current.empleado.metadata)) {
    redirect('/dashboard')
  }

  const now = new Date().toISOString()
  let correctionMessageId: string | null = null

  try {
    correctionMessageId = await crearSolicitudCorreccionPrimerAcceso(service, {
      usuarioId: current.usuario.id,
      usuario: current.usuario,
      empleado: current.empleado,
      detalle,
    })
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'No fue posible registrar la solicitud de correccion.',
    }
  }

  const metadata = writePrimerAccesoMetadata(current.empleado.metadata, {
    required: false,
    estado: 'CORRECCION_SOLICITADA',
    reviewedAt: now,
    correctionRequestedAt: now,
    correctionNote: detalle,
    correctionMessageId,
  })

  const { error: updateError } = await service
    .from('empleado')
    .update({
      metadata,
      updated_at: now,
    })
    .eq('id', current.empleado.id)

  if (updateError) {
    return { error: updateError.message }
  }

  await registrarAuditLog(service, {
    tabla: 'empleado',
    registroId: current.empleado.id,
    usuarioId: current.usuario.id,
    cuentaClienteId: current.usuario.cuenta_cliente_id,
    payload: {
      accion: 'primer_acceso_correccion_solicitada',
      empleado_id: current.empleado.id,
      correction_message_id: correctionMessageId,
    },
  })

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
