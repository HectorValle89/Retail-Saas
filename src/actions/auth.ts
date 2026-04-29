'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  ACCESS_FLOW_LINK_HOURS,
  ACCESS_FLOW_OTP_LENGTH,
  addHoursToIso,
  clearActivationTicket,
  clearFlowLinkTokenMetadata,
  findActiveAuthFlowByUser,
  findAuthFlowById,
  findLatestAuthFlowByUser,
  findLatestPasswordPendingFlowByEmail,
  issueActivationTicket,
  issueActivationOtp,
  issueFlowLinkToken,
  isFlowActive,
  normalizeEmail,
  readActivationTicketValidity,
  updateAuthFlow,
  upsertAuthFlow,
  validateFlowLinkToken,
  validateActivationOtp,
  type AuthActivationFlowRow,
  type AuthFlowType,
} from '@/lib/auth/accessFlow'
import {
  isPrimerAccesoPendiente,
  writePrimerAccesoMetadata,
} from '@/lib/auth/firstAccess'
import {
  PROVISIONAL_EMAIL_DOMAIN,
  isProvisionalAuthEmail,
  reconcileActiveAccountAccessIdentity,
} from '@/lib/auth/accessIdentity'
import { obtenerClienteAdmin, obtenerUrlBaseAplicacion } from '@/lib/auth/admin'
import {
  extractUsuarioOperativoEmpleado,
  resolverUsuarioOperativoPorAuthUserId,
} from '@/lib/auth/usuarioOperativo'
import {
  getSupabaseAuthFriendlyErrorMessage,
  isSupabaseAuthNetworkError,
} from '@/lib/supabase/authClientErrors'
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
  password_temporal_generada_en: string | null
  password_temporal_expira_en: string | null
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

type AccesoResuelto = {
  email: string | null
  authUserId: string | null
  username: string | null
  error: string | null
}

type UsuarioAccesoInicialLookup = {
  id: string
  auth_user_id: string | null
  estado_cuenta: string | null
  username: string | null
  correo_verificado?: boolean | null
  correo_electronico?: string | null
}

type UsuarioAccesoLoginRow = {
  id: string
  auth_user_id: string | null
  estado_cuenta: string | null
  username: string | null
  correo_electronico: string | null
}

type AuthAdminUserMetadata = {
  pending_email?: string | null
  provisional_email?: boolean | null
  allow_username_login?: boolean | null
  email_verified?: boolean | null
  first_access_password?: boolean | null
  username?: string | null
  confirmed_email?: string | null
  activated_at?: string | null
  [key: string]: unknown
}

const FIRST_ACCESS_PASSWORD = 'BTL2026'
async function sendActivationOtpEmailSafe(email: string, otpCode: string) {
  const mod = await import('@/lib/notifications/authSecurityEmail')
  return mod.sendActivationOtpEmail({ email }, otpCode)
}

async function sendCredentialTransitionLinkEmailSafe(
  email: string,
  payload: {
    title: string
    intro: string
    actionLabel: string
    actionHref: string
    text: string
  }
) {
  const mod = await import('@/lib/notifications/authSecurityEmail')
  return mod.sendCredentialTransitionLinkEmail({ email }, payload)
}

async function sendPasswordChangedNoticeEmailSafe(email: string, name?: string | null) {
  const mod = await import('@/lib/notifications/authSecurityEmail')
  return mod.sendPasswordChangedNoticeEmail({ email, name })
}

async function sendEmailChangeNoticeToCurrentEmailSafe(currentEmail: string, nextEmail: string, name?: string | null) {
  const mod = await import('@/lib/notifications/authSecurityEmail')
  return mod.sendEmailChangeNoticeToCurrentEmail({ email: currentEmail, name }, nextEmail)
}

function esCorreoProvisional(correo: string | null | undefined) {
  return isProvisionalAuthEmail(correo)
}

function validarPasswordSegura(password: string) {
  if (password.length < 8) {
    return 'La contrasena debe tener al menos 8 caracteres.'
  }

  if (!/[A-Z]/.test(password)) {
    return 'La contrasena debe incluir al menos una mayuscula.'
  }

  if (!/[a-z]/.test(password)) {
    return 'La contrasena debe incluir al menos una minuscula.'
  }

  if (!/[0-9]/.test(password)) {
    return 'La contrasena debe incluir al menos un numero.'
  }

  return null
}

function limpiarEstadoProvisionalMetadata(
  metadata: AuthAdminUserMetadata | null | undefined,
  correoFinal: string
): AuthAdminUserMetadata {
  const normalizedEmail = correoFinal.trim().toLowerCase()

  return {
    ...(metadata ?? {}),
    pending_email: null,
    provisional_email: false,
    allow_username_login: false,
    email_verified: true,
    first_access_password: false,
    confirmed_email: normalizedEmail,
    activated_at: new Date().toISOString(),
  }
}

function buildCuentaFinalizadaPayload(correoFinal: string, now: string, authUserId: string) {
  return {
    auth_user_id: authUserId,
    estado_cuenta: 'ACTIVA' as const,
    correo_verificado: true,
    correo_electronico: correoFinal,
    password_temporal_generada_en: null,
    password_temporal_expira_en: null,
    updated_at: now,
  }
}

async function resolverCorreoDeAcceso(acceso: string): Promise<AccesoResuelto> {
  if (acceso.includes('@')) {
    const correoNormalizado = acceso.toLowerCase()
    const { service } = obtenerClienteAdmin()

    if (service) {
      const { data } = await service
        .from('usuario')
        .select('auth_user_id, username, estado_cuenta, correo_verificado, correo_electronico')
        .eq('correo_electronico', correoNormalizado)
        .maybeSingle()

      const usuario = data as UsuarioAccesoInicialLookup | null

      if (usuario?.auth_user_id) {
        if (usuario.estado_cuenta === 'ACTIVA' && usuario.correo_verificado && usuario.correo_electronico) {
          const reconciled = await reconcileActiveAccountAccessIdentity(service, usuario)

          return {
            email: reconciled.canonicalEmail,
            authUserId: usuario.auth_user_id,
            username: usuario.username ?? null,
            error: null,
          }
        }

        const { data: usuarioAuth, error: adminGetUserError } = await service.auth.admin.getUserById(
          usuario.auth_user_id
        )

        if (!adminGetUserError && usuarioAuth.user.email) {
          return {
            email: usuarioAuth.user.email.trim().toLowerCase(),
            authUserId: usuario.auth_user_id,
            username: usuario.username ?? null,
            error: null,
          }
        }
      }
    }

    return {
      email: correoNormalizado,
      authUserId: null,
      username: null,
      error: null,
    }
  }

  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return {
      email: null,
      authUserId: null,
      username: null,
      error:
        'El acceso por usuario temporal requiere backend administrativo. Usa tu correo o configura SUPABASE_SERVICE_ROLE_KEY.',
    }
  }

  const { data } = await service
    .from('usuario')
    .select('auth_user_id, username, estado_cuenta, correo_verificado')
    .eq('username', acceso)
    .maybeSingle()
  const usuario = data as UsuarioAccesoInicialLookup | null

  if (!usuario?.auth_user_id) {
    return {
      email: null,
      authUserId: null,
      username: usuario?.username ?? acceso,
      error: adminError ?? 'La cuenta todavia no tiene un usuario de acceso provisionado en auth.',
    }
  }

  const { data: usuarioAuth, error: adminGetUserError } = await service.auth.admin.getUserById(
    usuario.auth_user_id
  )

  if (adminGetUserError || !usuarioAuth.user.email) {
    return {
      email: null,
      authUserId: usuario.auth_user_id,
      username: usuario.username ?? acceso,
      error: 'No fue posible resolver el correo de acceso para esa cuenta.',
    }
  }

  const authEmail = usuarioAuth.user.email.trim().toLowerCase()
  const authMetadata = (usuarioAuth.user.user_metadata ?? null) as AuthAdminUserMetadata | null
  const loginPorUsernamePermitido =
    authMetadata?.allow_username_login ??
    (esCorreoProvisional(authEmail) ||
      usuario.estado_cuenta === 'PROVISIONAL' ||
      usuario.estado_cuenta === 'PENDIENTE_VERIFICACION_EMAIL' ||
      usuario.estado_cuenta === 'PENDIENTE_PRIMER_LOGIN' ||
      !usuario.correo_verificado)

  if (!loginPorUsernamePermitido) {
    return {
      email: null,
      authUserId: usuario.auth_user_id,
      username: usuario.username ?? acceso,
      error: 'Tu usuario provisional ya no es valido. Inicia sesion con tu correo corporativo.',
    }
  }

  return {
    email: authEmail,
    authUserId: usuario.auth_user_id,
    username: usuario.username ?? acceso,
    error: null,
  }
}

async function buscarUsuarioOperativoPorAcceso(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  accesoResuelto: AccesoResuelto
) {
  let query = service
    .from('usuario')
    .select('id, auth_user_id, estado_cuenta, username, correo_electronico')

  if (accesoResuelto.authUserId) {
    query = query.eq('auth_user_id', accesoResuelto.authUserId)
  } else if (accesoResuelto.username) {
    query = query.eq('username', accesoResuelto.username)
  } else if (accesoResuelto.email) {
    query = query.eq('correo_electronico', accesoResuelto.email.trim().toLowerCase())
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return (data ?? null) as UsuarioAccesoLoginRow | null
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

  if (usuario?.estado_cuenta) {
    return usuario.estado_cuenta
  }

  const usuarioOperativo = await resolverUsuarioOperativoPorAuthUserId(supabase, authUserId)
  return usuarioOperativo?.estado_cuenta ?? null
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
  const normalized = normalizeEmail(correoElectronico)
  if (!normalized) {
    return null
  }

  let query = service
    .from('usuario')
    .select('id, correo_verificado, estado_cuenta')
    .eq('correo_electronico', normalized)
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
  _service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, usuario: null, empleado: null, error: 'La sesion actual no es valida.' }
  }

  const { data: usuarioDirecto } = await _service
    .from('usuario')
    .select(
      'id, empleado_id, cuenta_cliente_id, auth_user_id, username, correo_electronico, correo_verificado, estado_cuenta, empleado:empleado_id(id, nombre_completo, puesto, metadata)'
    )
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const usuarioDirectoActual = (usuarioDirecto ?? null) as
    | {
        id: string
        empleado_id: string
        cuenta_cliente_id: string | null
        auth_user_id: string | null
        username: string | null
        correo_electronico: string | null
        correo_verificado: boolean
        estado_cuenta: string
        empleado:
          | {
              id: string
              nombre_completo: string
              puesto: string
              metadata: Record<string, unknown> | null
            }
          | Array<{
              id: string
              nombre_completo: string
              puesto: string
              metadata: Record<string, unknown> | null
            }>
          | null
      }
    | null

  if (usuarioDirectoActual) {
    const empleadoDirecto = Array.isArray(usuarioDirectoActual.empleado)
      ? usuarioDirectoActual.empleado[0] ?? null
      : usuarioDirectoActual.empleado

    if (empleadoDirecto) {
      return {
        user,
        usuario: usuarioDirectoActual,
        empleado: empleadoDirecto,
        error: null,
      }
    }

    const { data: empleadoFallback } = await _service
      .from('empleado')
      .select('id, nombre_completo, puesto, metadata')
      .eq('id', usuarioDirectoActual.empleado_id)
      .maybeSingle()

    const empleadoRecuperado = (empleadoFallback ?? null) as EmpleadoPrimerAccesoRow | null
    if (!empleadoRecuperado) {
      return {
        user,
        usuario: usuarioDirectoActual,
        empleado: null,
        error: 'No existe un empleado asociado a la cuenta actual.',
      }
    }

    return {
      user,
      usuario: usuarioDirectoActual,
      empleado: empleadoRecuperado,
      error: null,
    }
  }

  const usuarioActual = await resolverUsuarioOperativoPorAuthUserId(supabase, user.id)
  if (!usuarioActual) {
    return {
      user,
      usuario: null,
      empleado: null,
      error: 'No existe un usuario operativo asociado a esta sesion.',
    }
  }

  const empleadoActual = extractUsuarioOperativoEmpleado(usuarioActual)
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
    usuario: Pick<UsuarioPrimerAccesoRow, 'id' | 'cuenta_cliente_id' | 'username' | 'correo_electronico'>
    empleado: EmpleadoPrimerAccesoRow
    detalle: string
  }
) {
  const { data: recipients, error: recipientsError } = await service
    .from('empleado')
    .select('id, nombre_completo, puesto')
    .eq('estatus_laboral', 'ACTIVO')
    .in('puesto', ['ADMINISTRADOR'])
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
      grupo_destino: 'ADMINISTRADOR',
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

async function sincronizarAccesoInicial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  acceso: {
    email: string
    authUserId: string | null
    username: string | null
  },
  passwordIntentado: string
) {
  const correoNormalizado = acceso.email.trim().toLowerCase()
  const esCuentaPrueba = correoNormalizado.endsWith('@fieldforce.test')

  let usuario: UsuarioAccesoInicialLookup | null = null
  let error: { message?: string } | null = null

  if (acceso.authUserId) {
    const result = await service
      .from('usuario')
      .select('id, auth_user_id, estado_cuenta, username, correo_verificado')
      .eq('auth_user_id', acceso.authUserId)
      .maybeSingle()
    usuario = (result.data ?? null) as UsuarioAccesoInicialLookup | null
    error = result.error
  } else if (acceso.username) {
    const result = await service
      .from('usuario')
      .select('id, auth_user_id, estado_cuenta, username, correo_verificado')
      .eq('username', acceso.username)
      .maybeSingle()
    usuario = (result.data ?? null) as UsuarioAccesoInicialLookup | null
    error = result.error
  } else {
    const result = await service
      .from('usuario')
      .select('id, auth_user_id, estado_cuenta, username, correo_verificado')
      .eq('correo_electronico', correoNormalizado)
      .maybeSingle()
    usuario = (result.data ?? null) as UsuarioAccesoInicialLookup | null
    error = result.error
  }

  if (error || !usuario?.auth_user_id) {
    return null
  }

  const requiereSincronizacion =
    esCuentaPrueba ||
    usuario.estado_cuenta === 'PROVISIONAL' ||
    usuario.estado_cuenta === 'PENDIENTE_VERIFICACION_EMAIL' ||
    usuario.estado_cuenta === 'PENDIENTE_PRIMER_LOGIN'

  if (!requiereSincronizacion) {
    return null
  }

  const passwordBase =
    passwordIntentado === FIRST_ACCESS_PASSWORD ? passwordIntentado : FIRST_ACCESS_PASSWORD

  const { error: updateError } = await service.auth.admin.updateUserById(usuario.auth_user_id, {
    password: passwordBase,
    email_confirm: true,
    user_metadata: {
      username: usuario.username,
      source: 'first_access_login_recovery',
      first_access_password: true,
    },
  })

  if (updateError) {
    return updateError.message
  }

  try {
    const retry = await supabase.auth.signInWithPassword({
      email: correoNormalizado,
      password: passwordBase,
    })

    if (!retry.error) {
      return null
    }

    return getSupabaseAuthFriendlyErrorMessage(retry.error)
  } catch (error) {
    return getSupabaseAuthFriendlyErrorMessage(error)
  }
}

function buildConfirmRedirect(siteUrl: string, flowId: string) {
  return `${siteUrl}/api/auth/confirm?flow_id=${flowId}`
}

async function buildManagedFlowLink(siteUrl: string, flow: AuthActivationFlowRow) {
  const { token, flow: updatedFlow } = await issueFlowLinkToken(flow)

  return {
    actionLink: `${buildConfirmRedirect(siteUrl, updatedFlow.id)}&flow_token=${encodeURIComponent(token)}`,
    flow: updatedFlow,
  }
}

async function buildActivationLinkPayload(flow: AuthActivationFlowRow) {
  const siteUrl = await obtenerUrlBaseAplicacion()
  return buildManagedFlowLink(siteUrl, flow)
}

async function buildRecoveryLinkPayload(flow: AuthActivationFlowRow) {
  const siteUrl = await obtenerUrlBaseAplicacion()
  return buildManagedFlowLink(siteUrl, flow)
}

async function ensureUsuarioActualParaFlow(tipoFlujo: AuthFlowType) {
  const supabase = await createClient()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { supabase, service: null, usuario: null, empleado: null, user: null, error: adminError }
  }

  const current = await cargarUsuarioYEmpleadoActual(supabase, service)
  if (current.error || !current.usuario || !current.user) {
    return {
      supabase,
      service,
      usuario: null,
      empleado: current.empleado,
      user: current.user,
      error: current.error ?? 'No fue posible cargar la cuenta actual.',
    }
  }

  if (
    tipoFlujo === 'PRIMER_INGRESO' &&
    current.usuario.estado_cuenta !== 'PROVISIONAL' &&
    current.usuario.estado_cuenta !== 'PENDIENTE_VERIFICACION_EMAIL'
  ) {
    return {
      supabase,
      service,
      usuario: current.usuario,
      empleado: current.empleado,
      user: current.user,
      error: 'Esta cuenta ya no esta en primer ingreso.',
    }
  }

  if (current.usuario.estado_cuenta === 'SUSPENDIDA' || current.usuario.estado_cuenta === 'BAJA') {
    return {
      supabase,
      service,
      usuario: current.usuario,
      empleado: current.empleado,
      user: current.user,
      error: 'La cuenta actual no puede continuar con este flujo.',
    }
  }

  return { supabase, service, ...current }
}

async function finalizeCredentialTransition(flow: AuthActivationFlowRow, password: string) {
  const { service, error } = obtenerClienteAdmin()
  if (!service) {
    throw new Error(error ?? 'No fue posible cerrar el flujo de acceso.')
  }

  const correoFinal = normalizeEmail(flow.correo_confirmado ?? flow.correo_pendiente)
  if (!correoFinal || !flow.auth_user_id) {
    throw new Error('No fue posible resolver el correo definitivo de la cuenta.')
  }

  const { data: usuario } = await service
    .from('usuario')
    .select('id, empleado_id, cuenta_cliente_id')
    .eq('id', flow.usuario_id)
    .maybeSingle()

  if (!usuario) {
    throw new Error('No existe un usuario operativo asociado al flujo.')
  }

  const conflictoCorreo = await buscarConflictoCorreoVerificado(service, {
    correoElectronico: correoFinal,
    excludeUsuarioId: usuario.id,
  })

  if (conflictoCorreo) {
    throw new Error(
      'Ese correo ya fue verificado por otra cuenta. Contacta al administrador para corregir el acceso.'
    )
  }

  const { data: adminUserData, error: adminUserError } = await service.auth.admin.getUserById(flow.auth_user_id)

  if (adminUserError || !adminUserData.user) {
    throw new Error(adminUserError?.message ?? 'No fue posible recuperar la cuenta en Auth.')
  }

  const cleanedMetadata = limpiarEstadoProvisionalMetadata(
    (adminUserData.user.user_metadata ?? null) as AuthAdminUserMetadata | null,
    correoFinal
  )

  const { error: finalizeAuthError } = await service.auth.admin.updateUserById(flow.auth_user_id, {
    email: correoFinal,
    password,
    email_confirm: true,
    user_metadata: cleanedMetadata,
  })

  if (finalizeAuthError) {
    throw new Error(finalizeAuthError.message)
  }

  const now = new Date().toISOString()

  await service
    .from('usuario')
    .update(buildCuentaFinalizadaPayload(correoFinal, now, flow.auth_user_id))
    .eq('id', usuario.id)

  await service
    .from('empleado')
    .update({
      correo_electronico: correoFinal,
      updated_at: now,
    })
    .eq('id', usuario.empleado_id)

  await updateAuthFlow(flow.id, {
    estado: 'COMPLETED',
    correo_confirmado: correoFinal,
    password_set_at: now,
    completed_at: now,
  })

  await service.rpc('invalidar_sesiones_auth_user', { p_auth_user_id: flow.auth_user_id })
  await service.rpc('refrescar_claims_auth_user', { p_auth_user_id: flow.auth_user_id })

  return { correoFinal, cuentaClienteId: usuario.cuenta_cliente_id, empleadoId: usuario.empleado_id, usuarioId: usuario.id }
}

async function finalizePasswordRecovery(flow: AuthActivationFlowRow, password: string) {
  const { service, error } = obtenerClienteAdmin()
  if (!service) {
    throw new Error(error ?? 'No fue posible cerrar la recuperacion de acceso.')
  }

  if (!flow.auth_user_id) {
    throw new Error('El flujo de recuperacion no tiene una cuenta operativa asociada.')
  }

  const { error: updateError } = await service.auth.admin.updateUserById(flow.auth_user_id, {
    password,
  })

  if (updateError) {
    throw new Error(updateError.message)
  }

  const now = new Date().toISOString()
  await updateAuthFlow(flow.id, {
    estado: 'COMPLETED',
    password_set_at: now,
    completed_at: now,
  })

  await service.rpc('invalidar_sesiones_auth_user', { p_auth_user_id: flow.auth_user_id })
  return { correoFinal: flow.correo_confirmado ?? flow.correo_pendiente }
}

async function sendActivationLinkForFlow(flow: AuthActivationFlowRow) {
  const nextEmail = normalizeEmail(flow.correo_pendiente)

  if (!nextEmail) {
    throw new Error('No fue posible resolver el correo pendiente del flujo.')
  }

  const { actionLink, flow: updatedFlow } = await buildActivationLinkPayload(flow)

  await sendCredentialTransitionLinkEmailSafe(nextEmail, {
    title: 'Confirma tu correo para activar tu acceso',
    intro: 'Tu cuenta sigue en espera. Valida tu correo para continuar a la creacion de tu contrasena definitiva.',
    actionLabel: 'Confirmar cambio de correo',
    actionHref: actionLink,
    text: `Confirma tu correo y continua tu activacion aqui: ${actionLink}`,
  })

  return updateAuthFlow(updatedFlow.id, {
    estado: 'AWAITING_EMAIL_CONFIRMATION',
  })
}

async function sendRecoveryLinkForFlow(flow: AuthActivationFlowRow, email: string) {
  const { actionLink, flow: updatedFlow } = await buildRecoveryLinkPayload(flow)

  await sendCredentialTransitionLinkEmailSafe(email, {
    title: 'Restablece tu contrasena en Beteele One',
    intro: 'Recibimos una solicitud para recuperar tu acceso. Usa este enlace para definir una contrasena nueva.',
    actionLabel: 'Restablecer contrasena',
    actionHref: actionLink,
    text: `Restablece tu contrasena con este enlace: ${actionLink}`,
  })

  return updateAuthFlow(updatedFlow.id, {
    estado: 'RESET_LINK_SENT',
  })
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const acceso = String(formData.get('acceso') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!acceso || !password) {
    return { error: 'Ingresa tu correo o usuario y tu contrasena.' }
  }

  const accesoResuelto = await resolverCorreoDeAcceso(acceso)

  if (accesoResuelto.error) {
    return { error: accesoResuelto.error }
  }

  if (!accesoResuelto.email) {
    return { error: 'No encontramos un acceso valido para esa cuenta.' }
  }

  const { service } = obtenerClienteAdmin()
  if (service) {
    const usuarioLogin = await buscarUsuarioOperativoPorAcceso(service, accesoResuelto)

    if (
      usuarioLogin &&
      (usuarioLogin.estado_cuenta === 'PROVISIONAL' ||
        usuarioLogin.estado_cuenta === 'PENDIENTE_VERIFICACION_EMAIL')
    ) {
      const latestFirstAccessFlow = await findLatestAuthFlowByUser(usuarioLogin.id, 'PRIMER_INGRESO')

      if (latestFirstAccessFlow?.estado === 'EXPIRED') {
        redirect(`/enlace-caducado?flow_id=${encodeURIComponent(latestFirstAccessFlow.id)}`)
        return { error: null }
      }
    }
  }

  let error: { message: string } | null = null

  try {
    const result = await supabase.auth.signInWithPassword({
      email: accesoResuelto.email,
      password,
    })
    error = result.error
  } catch (loginError) {
    return {
      error: getSupabaseAuthFriendlyErrorMessage(loginError),
    }
  }

  if (error) {
    if (isSupabaseAuthNetworkError(error)) {
      return { error: getSupabaseAuthFriendlyErrorMessage(error) }
    }

    if (service) {
      const flowPendiente = await findLatestPasswordPendingFlowByEmail(accesoResuelto.email ?? acceso)
      if (flowPendiente) {
        return {
          error:
            'Tu cuenta ya esta verificada, pero todavia falta configurar tu seguridad. Usa el enlace reciente o solicita un codigo de acceso para retomar la activacion.',
        }
      }

      const recoveryError = await sincronizarAccesoInicial(
        supabase,
        service,
        {
          email: accesoResuelto.email,
          authUserId: accesoResuelto.authUserId,
          username: accesoResuelto.username,
        },
        password
      )

      if (!recoveryError) {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const estadoCuentaRecuperada = await obtenerEstadoCuenta(supabase, user.id)

          if (!estadoCuentaRecuperada) {
            await supabase.auth.signOut()
            return { error: 'No existe un usuario operativo vinculado a esta cuenta.' }
          }

          if (estadoCuentaRecuperada === 'SUSPENDIDA' || estadoCuentaRecuperada === 'BAJA') {
            await supabase.auth.signOut()
            return { error: 'Tu cuenta no tiene acceso operativo. Contacta al administrador.' }
          }

          await registrarUltimoAcceso(user.id)
          revalidatePath('/', 'layout')

          if (estadoCuentaRecuperada === 'PENDIENTE_PRIMER_LOGIN') {
            redirect('/primer-acceso')
          }

          if (
            estadoCuentaRecuperada === 'PROVISIONAL' ||
            estadoCuentaRecuperada === 'PENDIENTE_VERIFICACION_EMAIL'
          ) {
            redirect('/activacion')
          }

          redirect('/dashboard')
        }
      }

      if (recoveryError) {
        return { error: recoveryError }
      }
    }

    return { error: getSupabaseAuthFriendlyErrorMessage(error) }
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

  if (estadoCuenta === 'PENDIENTE_PRIMER_LOGIN') {
    redirect('/primer-acceso')
  }

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
  const correoElectronico = normalizeEmail(String(formData.get('correo_electronico') ?? ''))

  if (!correoElectronico) {
    return { error: 'Ingresa un correo valido para activar la cuenta.' }
  }

  const current = await ensureUsuarioActualParaFlow('PRIMER_INGRESO')
  if (current.error || !current.service || !current.usuario || !current.user) {
    return { error: current.error ?? 'No fue posible preparar el flujo de activacion.' }
  }

  const conflictoCorreo = await buscarConflictoCorreoVerificado(current.service, {
    correoElectronico,
    excludeUsuarioId: current.usuario.id,
  })

  if (conflictoCorreo) {
    return {
      error:
        'Ese correo ya pertenece a otra cuenta verificada. Usa un correo distinto o solicita correccion administrativa.',
    }
  }

  const flow = await upsertAuthFlow({
    usuarioId: current.usuario.id,
    authUserId: current.user.id,
    tipoFlujo: 'PRIMER_INGRESO',
    estado: 'AWAITING_EMAIL_CONFIRMATION',
    correoPendiente: correoElectronico,
    linkSentAt: new Date().toISOString(),
    linkExpiresAt: addHoursToIso(ACCESS_FLOW_LINK_HOURS),
    metadata: {
      source: 'primer_ingreso',
    },
  })

  const { error: usuarioError } = await current.service
    .from('usuario')
    .update({
      correo_electronico: correoElectronico,
      estado_cuenta: 'PENDIENTE_VERIFICACION_EMAIL',
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.usuario.id)

  if (usuarioError) {
    return { error: usuarioError.message }
  }

  try {
    await sendActivationLinkForFlow(flow)
  } catch (sendError) {
    await updateAuthFlow(flow.id, { estado: 'CANCELLED', completed_at: new Date().toISOString() })
    return {
      error: sendError instanceof Error ? sendError.message : 'No fue posible enviar el enlace de activacion.',
    }
  }

  revalidatePath('/', 'layout')
  redirect('/activacion')
}

export async function reenviarCorreoActivacion() {
  const current = await ensureUsuarioActualParaFlow('PRIMER_INGRESO')
  if (current.error || !current.usuario) {
    return { error: current.error ?? 'No fue posible reenviar el correo.' }
  }

  const flow = await findActiveAuthFlowByUser(current.usuario.id, 'PRIMER_INGRESO')
  if (!flow) {
    return { error: 'No encontramos un flujo pendiente para esta cuenta.' }
  }

  await sendActivationLinkForFlow(flow)
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function cambiarCorreoPendienteActivacion(formData: FormData) {
  const correoElectronico = normalizeEmail(String(formData.get('correo_electronico') ?? ''))

  if (!correoElectronico) {
    return { error: 'Ingresa un correo valido para continuar.' }
  }

  const current = await ensureUsuarioActualParaFlow('PRIMER_INGRESO')
  if (current.error || !current.service || !current.usuario) {
    return { error: current.error ?? 'No fue posible cambiar el correo pendiente.' }
  }

  const conflictoCorreo = await buscarConflictoCorreoVerificado(current.service, {
    correoElectronico,
    excludeUsuarioId: current.usuario.id,
  })

  if (conflictoCorreo) {
    return {
      error: 'Ese correo ya pertenece a otra cuenta verificada. Usa un correo distinto.',
    }
  }

  const flow = await upsertAuthFlow({
    usuarioId: current.usuario.id,
    authUserId: current.user?.id ?? current.usuario.auth_user_id,
    tipoFlujo: 'PRIMER_INGRESO',
    estado: 'AWAITING_EMAIL_CONFIRMATION',
    correoPendiente: correoElectronico,
    linkSentAt: new Date().toISOString(),
    linkExpiresAt: addHoursToIso(ACCESS_FLOW_LINK_HOURS),
    metadata: {
      source: 'primer_ingreso',
      changed_email: true,
    },
  })

  const { error: usuarioError } = await current.service
    .from('usuario')
    .update({
      correo_electronico: correoElectronico,
      estado_cuenta: 'PENDIENTE_VERIFICACION_EMAIL',
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.usuario.id)

  if (usuarioError) {
    return { error: usuarioError.message }
  }

  await sendActivationLinkForFlow(flow)
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function generarNuevoEnlaceExpirado(formData: FormData) {
  const flowId = String(formData.get('flow_id') ?? '').trim()
  if (!flowId) {
    return { error: 'No encontramos el flujo que quieres recuperar.' }
  }

  const flow = await findAuthFlowById(flowId)
  if (!flow) {
    return { error: 'Ese flujo ya no existe o fue cancelado.' }
  }

  if (flow.tipo_flujo === 'RESET_PASSWORD') {
    const email = normalizeEmail(flow.correo_confirmado ?? flow.correo_pendiente ?? flow.correo_anterior)
    if (!email) {
      return { error: 'No fue posible resolver el correo para reenviar el enlace.' }
    }

    await sendRecoveryLinkForFlow(
      await updateAuthFlow(flow.id, {
        estado: 'RESET_LINK_SENT',
      }),
      email
    )

    return { success: true }
  }

  await sendActivationLinkForFlow(
    await updateAuthFlow(flow.id, {
      estado: 'AWAITING_EMAIL_CONFIRMATION',
    })
  )

  return { success: true }
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function resetPassword(formData: FormData) {
  const email = normalizeEmail(String(formData.get('email') ?? ''))

  if (!email) {
    return { error: 'Ingresa un correo valido.' }
  }

  const { service, error: adminError } = obtenerClienteAdmin()
  if (!service) {
    return { error: adminError }
  }

  const { data: usuario } = await service
    .from('usuario')
    .select('id, auth_user_id, estado_cuenta, correo_electronico')
    .eq('correo_electronico', email)
    .maybeSingle()

  if (!usuario || !usuario.auth_user_id) {
    return { success: true }
  }

  if (usuario.estado_cuenta !== 'ACTIVA') {
    return { error: 'Debes completar primero la activacion de la cuenta antes de recuperar el acceso.' }
  }

  await reconcileActiveAccountAccessIdentity(service, usuario)

  const flow = await upsertAuthFlow({
    usuarioId: usuario.id,
    authUserId: usuario.auth_user_id,
    tipoFlujo: 'RESET_PASSWORD',
    estado: 'RESET_LINK_SENT',
    correoConfirmado: email,
    linkSentAt: new Date().toISOString(),
    linkExpiresAt: addHoursToIso(ACCESS_FLOW_LINK_HOURS),
    metadata: {
      source: 'forgot_password',
    },
  })

  try {
    await sendRecoveryLinkForFlow(flow, email)
  } catch (error) {
    await updateAuthFlow(flow.id, { estado: 'CANCELLED', completed_at: new Date().toISOString() })
    return {
      error: error instanceof Error ? error.message : 'No fue posible enviar el enlace de recuperacion.',
    }
  }

  return { success: true }
}

export async function enviarOtpRescateActivacion(formData: FormData) {
  const email = normalizeEmail(String(formData.get('email') ?? ''))

  if (!email) {
    return { error: 'Indica el correo que ya verificaste para retomar la activacion.' }
  }

  const flow = await findLatestPasswordPendingFlowByEmail(email)
  if (!flow) {
    return { error: 'No encontramos una activacion pendiente para ese correo.' }
  }

  const { code } = await issueActivationOtp(flow)
  await sendActivationOtpEmailSafe(email, code)
  return { success: true }
}

export async function validarOtpRescateActivacion(formData: FormData) {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const otp = String(formData.get('otp') ?? '').trim()

  if (!email || !otp) {
    return { error: `Ingresa el correo y el codigo de ${ACCESS_FLOW_OTP_LENGTH} digitos.` }
  }

  const flow = await findLatestPasswordPendingFlowByEmail(email)
  if (!flow) {
    return { error: 'No encontramos una activacion pendiente para ese correo.' }
  }

  await validateActivationOtp(flow, otp)
  redirect(`/update-password?flow_id=${encodeURIComponent(flow.id)}&mode=first-access&recovery=otp`)
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const flowId = String(formData.get('flow_id') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  const passwordError = validarPasswordSegura(password)
  if (passwordError) {
    return { error: passwordError }
  }

  if (password !== confirmPassword) {
    return { error: 'La confirmacion de la contrasena no coincide.' }
  }

  let flow = flowId ? await findAuthFlowById(flowId) : null

  if (!flow) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'La sesion actual ya no es valida. Solicita un enlace nuevo para continuar.' }
    }

    const { service, error } = obtenerClienteAdmin()
    if (!service) {
      return { error }
    }

    const { data: usuario } = await service
      .from('usuario')
      .select('id, estado_cuenta, correo_electronico')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!usuario) {
      return { error: 'No existe un flujo pendiente para esta sesion.' }
    }

    flow =
      (await findActiveAuthFlowByUser(usuario.id, 'PRIMER_INGRESO')) ??
      (await findActiveAuthFlowByUser(usuario.id, 'CHANGE_EMAIL')) ??
      (await findActiveAuthFlowByUser(usuario.id, 'RESET_PASSWORD'))

    if (!flow) {
      if (user.email_confirmed_at) {
        if (usuario.estado_cuenta === 'ACTIVA') {
          const { error: updateError } = await supabase.auth.updateUser({ password })
          if (updateError) {
            return { error: updateError.message }
          }

          const emailForNotice = normalizeEmail(usuario.correo_electronico ?? user.email)
          if (emailForNotice) {
            await sendPasswordChangedNoticeEmailSafe(emailForNotice)
          }

          await supabase.auth.signOut()
          revalidatePath('/', 'layout')
          redirect('/login?notice=Tu contrasena se actualizo. Entra otra vez con la nueva clave.')
        }

        const syntheticFlow = await upsertAuthFlow({
          usuarioId: usuario.id,
          authUserId: user.id,
          tipoFlujo: 'PRIMER_INGRESO',
          estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
          correoPendiente: normalizeEmail(usuario.correo_electronico ?? user.email),
          correoConfirmado: normalizeEmail(user.email ?? usuario.correo_electronico),
          emailConfirmedAt: new Date().toISOString(),
          metadata: {
            source: 'legacy_update_password_fallback',
          },
        })

        flow = syntheticFlow
      }
    }
  }

  if (!flow || !isFlowActive(flow.estado)) {
    return { error: 'Este flujo ya expiro o fue cerrado. Solicita un enlace nuevo para continuar.' }
  }

  if (flow.tipo_flujo === 'RESET_PASSWORD') {
    if (flow.estado !== 'RESET_PASSWORD_PENDING' && flow.estado !== 'RESET_LINK_SENT') {
      return { error: 'Todavia falta validar el enlace de recuperacion.' }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const hasRecoverySession = Boolean(user && flow.auth_user_id && user.id === flow.auth_user_id)
    const hasRecoveryTicket = await readActivationTicketValidity(flow)
    const hasRecoveryFlowConfirmation =
      flow.estado === 'RESET_PASSWORD_PENDING' && Boolean(flow.email_confirmed_at)

    if (!hasRecoverySession && !hasRecoveryTicket && !hasRecoveryFlowConfirmation) {
      return { error: 'Abre de nuevo el enlace de recuperacion mas reciente para continuar.' }
    }

    await finalizePasswordRecovery(flow, password)
    await clearActivationTicket()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login?notice=Tu contrasena se actualizo. Entra otra vez con la nueva clave.')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const hasConfirmedSession = Boolean(
    user &&
      flow.auth_user_id &&
      user.id === flow.auth_user_id &&
      (user.email_confirmed_at || flow.email_confirmed_at)
  )
  const hasActivationTicket = await readActivationTicketValidity(flow)
  const hasCredentialFlowConfirmation =
    flow.estado === 'EMAIL_CONFIRMED_PASSWORD_PENDING' && Boolean(flow.email_confirmed_at)

  if (!hasConfirmedSession && !hasActivationTicket && !hasCredentialFlowConfirmation) {
    return {
      error:
        'Para continuar, abre el enlace reciente de tu correo o valida el codigo de acceso que se envio a tu bandeja.',
    }
  }

  const finalized = await finalizeCredentialTransition(flow, password)
  await clearActivationTicket()

  if (user) {
    await supabase.auth.signOut()
  }

  revalidatePath('/', 'layout')
  redirect(
    `/login?notice=${encodeURIComponent(
      `Tu acceso ya esta listo. Entra con ${finalized.correoFinal} y tu nueva contrasena.`
    )}`
  )
}

export async function cambiarPasswordAutenticado(formData: FormData) {
  const currentPassword = String(formData.get('current_password') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (!currentPassword) {
    return { error: 'Ingresa tu contrasena actual para autorizar el cambio.' }
  }

  const passwordError = validarPasswordSegura(password)
  if (passwordError) {
    return { error: passwordError }
  }

  if (password !== confirmPassword) {
    return { error: 'La confirmacion de la contrasena no coincide.' }
  }

  const supabase = await createClient()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError }
  }

  const current = await cargarUsuarioYEmpleadoActual(supabase, service)
  if (current.error || !current.usuario || !current.user) {
    return { error: current.error ?? 'No fue posible cargar la cuenta actual.' }
  }

  if (current.usuario.estado_cuenta !== 'ACTIVA') {
    return { error: 'Debes activar la cuenta antes de cambiar la contrasena.' }
  }

  const identity = await reconcileActiveAccountAccessIdentity(service, current.usuario)
  const email = normalizeEmail(identity.canonicalEmail ?? current.user.email)
  if (!email) {
    return { error: 'No existe un correo valido asociado a tu cuenta.' }
  }

  const signinCheck = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (signinCheck.error) {
    return { error: 'La contrasena actual no coincide con tu acceso.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return { error: updateError.message }
  }

  await registrarAuditLog(service, {
    tabla: 'usuario',
    registroId: current.usuario.id,
    usuarioId: current.usuario.id,
    cuentaClienteId: current.usuario.cuenta_cliente_id,
    payload: {
      accion: 'cambio_password_autenticado',
    },
  })

  await sendPasswordChangedNoticeEmailSafe(email, current.empleado?.nombre_completo ?? undefined)

  return { success: true }
}

export async function iniciarCambioCorreoAutenticado(formData: FormData) {
  const currentPassword = String(formData.get('current_password') ?? '')
  const nextEmail = normalizeEmail(String(formData.get('next_email') ?? ''))

  if (!currentPassword) {
    return { error: 'Ingresa tu contrasena actual para autorizar el cambio de correo.' }
  }

  if (!nextEmail) {
    return { error: 'Ingresa el nuevo correo que quieres usar para iniciar sesion.' }
  }

  const supabase = await createClient()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return { error: adminError }
  }

  const current = await cargarUsuarioYEmpleadoActual(supabase, service)
  if (current.error || !current.usuario || !current.user) {
    return { error: current.error ?? 'No fue posible cargar la cuenta actual.' }
  }

  if (current.usuario.estado_cuenta !== 'ACTIVA') {
    return { error: 'Debes activar la cuenta antes de cambiar el correo.' }
  }

  const identity = await reconcileActiveAccountAccessIdentity(service, current.usuario)
  const currentEmail = normalizeEmail(identity.canonicalEmail ?? current.user.email)
  if (!currentEmail) {
    return { error: 'No existe un correo activo asociado a tu cuenta.' }
  }

  if (nextEmail === currentEmail) {
    return { error: 'Ese correo ya es el correo principal de tu cuenta.' }
  }

  const conflictoCorreo = await buscarConflictoCorreoVerificado(service, {
    correoElectronico: nextEmail,
    excludeUsuarioId: current.usuario.id,
  })

  if (conflictoCorreo) {
    return { error: 'Ese correo ya pertenece a otra cuenta verificada.' }
  }

  const signinCheck = await supabase.auth.signInWithPassword({
    email: currentEmail,
    password: currentPassword,
  })

  if (signinCheck.error) {
    return { error: 'La contrasena actual no coincide con tu acceso.' }
  }

  const flow = await upsertAuthFlow({
    usuarioId: current.usuario.id,
    authUserId: current.user.id,
    tipoFlujo: 'CHANGE_EMAIL',
    estado: 'AWAITING_EMAIL_CONFIRMATION',
    correoAnterior: currentEmail,
    correoPendiente: nextEmail,
    linkSentAt: new Date().toISOString(),
    linkExpiresAt: addHoursToIso(ACCESS_FLOW_LINK_HOURS),
    metadata: {
      source: 'authenticated_change_email',
    },
  })

  await sendEmailChangeNoticeToCurrentEmailSafe(
    currentEmail,
    nextEmail,
    current.empleado?.nombre_completo ?? undefined
  )

  try {
    await sendActivationLinkForFlow(flow)
  } catch (sendError) {
    await updateAuthFlow(flow.id, { estado: 'CANCELLED', completed_at: new Date().toISOString() })
    return {
      error: sendError instanceof Error ? sendError.message : 'No fue posible enviar la validacion del nuevo correo.',
    }
  }

  await registrarAuditLog(service, {
    tabla: 'usuario',
    registroId: current.usuario.id,
    usuarioId: current.usuario.id,
    cuentaClienteId: current.usuario.cuenta_cliente_id,
    payload: {
      accion: 'inicio_cambio_correo_autenticado',
      correo_anterior: currentEmail,
      correo_pendiente: nextEmail,
      flow_id: flow.id,
    },
  })

  return { success: true }
}

export async function finalizarCambioCorreo(formData: FormData) {
  return updatePassword(formData)
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

  if (
    current.usuario.estado_cuenta !== 'ACTIVA' &&
    current.usuario.estado_cuenta !== 'PENDIENTE_PRIMER_LOGIN'
  ) {
    return { error: 'Debes completar primero la activacion de la cuenta.' }
  }

  if (
    !isPrimerAccesoPendiente(current.empleado.metadata) &&
    current.usuario.estado_cuenta !== 'PENDIENTE_PRIMER_LOGIN'
  ) {
    redirect('/dashboard')
  }

  const now = new Date().toISOString()
  const estadoAnterior = current.usuario.estado_cuenta
  const estadoNuevo =
    current.usuario.estado_cuenta === 'PENDIENTE_PRIMER_LOGIN' ? 'ACTIVA' : current.usuario.estado_cuenta
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

  if (estadoNuevo !== estadoAnterior) {
    const { error: usuarioError } = await service
      .from('usuario')
      .update({
        estado_cuenta: estadoNuevo,
        updated_at: now,
      })
      .eq('id', current.usuario.id)

    if (usuarioError) {
      return { error: usuarioError.message }
    }
  }

  await registrarAuditLog(service, {
    tabla: 'empleado',
    registroId: current.empleado.id,
    usuarioId: current.usuario.id,
    cuentaClienteId: current.usuario.cuenta_cliente_id,
    payload: {
      accion: 'primer_acceso_confirmado',
      empleado_id: current.empleado.id,
      estado_cuenta_anterior: estadoAnterior,
      estado_cuenta_nuevo: estadoNuevo,
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

  if (
    current.usuario.estado_cuenta !== 'ACTIVA' &&
    current.usuario.estado_cuenta !== 'PENDIENTE_PRIMER_LOGIN'
  ) {
    return { error: 'Debes completar primero la activacion de la cuenta.' }
  }

  if (
    !isPrimerAccesoPendiente(current.empleado.metadata) &&
    current.usuario.estado_cuenta !== 'PENDIENTE_PRIMER_LOGIN'
  ) {
    redirect('/dashboard')
  }

  const now = new Date().toISOString()
  const estadoAnterior = current.usuario.estado_cuenta
  const estadoNuevo =
    current.usuario.estado_cuenta === 'PENDIENTE_PRIMER_LOGIN' ? 'ACTIVA' : current.usuario.estado_cuenta
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

  if (estadoNuevo !== estadoAnterior) {
    const { error: usuarioError } = await service
      .from('usuario')
      .update({
        estado_cuenta: estadoNuevo,
        updated_at: now,
      })
      .eq('id', current.usuario.id)

    if (usuarioError) {
      return { error: usuarioError.message }
    }
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
      estado_cuenta_anterior: estadoAnterior,
      estado_cuenta_nuevo: estadoNuevo,
    },
  })

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
