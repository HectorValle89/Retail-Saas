'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { obtenerClienteAdmin, obtenerUrlBaseAplicacion } from '@/lib/auth/admin'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import type { Empleado, EstadoCuenta, Puesto } from '@/types/database'
import { ESTADO_USUARIO_ADMIN_INICIAL, type UsuarioAdminActionState } from './state'
import {
  canSendProvisionalCredentialsEmail,
  sendProvisionalCredentialsEmail,
} from '@/lib/notifications/provisionalCredentialsEmail'

type MaybeMany<T> = T | T[] | null

type AccionCuenta = 'SUSPENDER' | 'REACTIVAR'

type EmpleadoCreateRow = Pick<
  Empleado,
  'id' | 'id_nomina' | 'nombre_completo' | 'puesto' | 'correo_electronico' | 'estatus_laboral'
>

interface CuentaClienteRelacion {
  nombre: string
  identificador: string
}

interface EmpleadoRelacion {
  nombre_completo: string
  puesto: Puesto
}

interface UsuarioGestionRow {
  id: string
  auth_user_id: string | null
  empleado_id: string
  cuenta_cliente_id: string | null
  username: string | null
  estado_cuenta: EstadoCuenta
  correo_verificado: boolean
  correo_electronico: string | null
  empleado: MaybeMany<EmpleadoRelacion>
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

const PUESTOS_DISPONIBLES: Puesto[] = [
  'ADMINISTRADOR',
  'COORDINADOR',
  'SUPERVISOR',
  'DERMOCONSEJERO',
  'RECLUTAMIENTO',
  'NOMINA',
  'LOGISTICA',
  'VENTAS',
  'LOVE_IS',
  'CLIENTE',
]

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function buildState(
  partial: Partial<UsuarioAdminActionState>
): UsuarioAdminActionState {
  return {
    ...ESTADO_USUARIO_ADMIN_INICIAL,
    ...partial,
  }
}

function createTemporaryPassword() {
  return `Rtl!${crypto.randomBytes(9).toString('base64url')}`
}

function sanitizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .replace(/[_\-.]{2,}/g, '_')
}

function buildPreferredUsername(
  explicitValue: string,
  empleado: EmpleadoCreateRow
) {
  const explicit = sanitizeToken(explicitValue)

  if (explicit) {
    return explicit
  }

  const nombre = sanitizeToken(empleado.nombre_completo)

  if (nombre) {
    return `${nombre}_${empleado.id.replace(/-/g, '').slice(0, 6)}`
  }

  return `usr_${empleado.id.replace(/-/g, '').slice(0, 12)}`
}

function buildPlaceholderEmail(username: string) {
  return `${username}@provisional.fieldforce.invalid`
}

async function obtenerHorasPasswordTemporal(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>
) {
  const { data } = await service
    .from('configuracion')
    .select('valor')
    .eq('clave', 'auth.activacion.password_temporal_horas')
    .maybeSingle()

  return Number(data?.valor ?? 72) || 72
}

async function registrarEventoAudit(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    tabla,
    registroId,
    payload,
    usuarioId,
    cuentaClienteId,
  }: {
    tabla: string
    registroId: string
    payload: Record<string, unknown>
    usuarioId: string
    cuentaClienteId: string | null
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

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@')

  if (!localPart || !domain) {
    return value
  }

  const visibleLocal = localPart.slice(0, 2)
  return `${visibleLocal}${'*'.repeat(Math.max(localPart.length - 2, 2))}@${domain}`
}

export async function crearUsuarioAdministrativo(
  _prevState: UsuarioAdminActionState,
  formData: FormData
): Promise<UsuarioAdminActionState> {
  const actor = await requerirAdministradorActivo()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const usernameInput = String(formData.get('username') ?? '').trim()
  const cuentaClienteId = String(formData.get('cuenta_cliente_id') ?? '').trim() || null

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado para crear el usuario.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, id_nomina, nombre_completo, puesto, correo_electronico, estatus_laboral')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({
      message: empleadoError?.message ?? 'No fue posible encontrar el empleado seleccionado.',
    })
  }

  if (empleado.estatus_laboral === 'BAJA') {
    return buildState({ message: 'No se puede crear acceso para un empleado dado de baja.' })
  }

  const { data: usuarioExistente } = await service
    .from('usuario')
    .select('id')
    .eq('empleado_id', empleado.id)
    .maybeSingle()

  if (usuarioExistente) {
    return buildState({ message: 'Ese empleado ya tiene un usuario administrativo vinculado.' })
  }

  if (empleado.puesto === 'CLIENTE' && !cuentaClienteId) {
    return buildState({
      message: 'Los usuarios con puesto CLIENTE deben vincularse a una cuenta cliente activa.',
    })
  }

  if (cuentaClienteId) {
    const { data: cuentaCliente, error: cuentaError } = await service
      .from('cuenta_cliente')
      .select('id, activa')
      .eq('id', cuentaClienteId)
      .maybeSingle()

    if (cuentaError || !cuentaCliente || !cuentaCliente.activa) {
      return buildState({
        message:
          cuentaError?.message ?? 'La cuenta cliente seleccionada no existe o no esta activa.',
      })
    }
  }

  const username = buildPreferredUsername(usernameInput, empleado as EmpleadoCreateRow)

  if (!username) {
    return buildState({ message: 'No fue posible generar un username valido para el usuario.' })
  }

  const { data: usernameExistente } = await service
    .from('usuario')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (usernameExistente) {
    return buildState({
      message: `El username ${username} ya existe. Ingresa otro valor para evitar colision.`,
    })
  }

  const horasVigencia = await obtenerHorasPasswordTemporal(service)
  const generatedAt = new Date()
  const expiresAt = new Date(generatedAt.getTime() + horasVigencia * 60 * 60 * 1000)
  const temporaryPassword = createTemporaryPassword()
  const temporaryEmail = buildPlaceholderEmail(username)

  const { data: createdAuth, error: createAuthError } = await service.auth.admin.createUser({
    email: temporaryEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      username,
      provisional_email: true,
      source: 'admin_users_module',
    },
  })

  if (createAuthError || !createdAuth.user) {
    return buildState({
      message: createAuthError?.message ?? 'No fue posible crear el usuario en auth.',
    })
  }

  const { data: insertedUser, error: insertUserError } = await service
    .from('usuario')
    .insert({
      auth_user_id: createdAuth.user.id,
      empleado_id: empleado.id,
      cuenta_cliente_id: cuentaClienteId,
      username,
      estado_cuenta: 'PROVISIONAL',
      correo_electronico: empleado.correo_electronico ?? null,
      correo_verificado: false,
      password_temporal_generada_en: generatedAt.toISOString(),
      password_temporal_expira_en: expiresAt.toISOString(),
      ultimo_acceso_en: null,
      updated_at: generatedAt.toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (insertUserError || !insertedUser) {
    await service.auth.admin.deleteUser(createdAuth.user.id, true)
    return buildState({
      message:
        insertUserError?.message ?? 'No fue posible crear el registro operativo del usuario.',
    })
  }

  await registrarEventoAudit(service, {
    tabla: 'usuario',
    registroId: insertedUser.id,
    payload: {
      evento: 'usuario_creado_admin',
      empleado_id: empleado.id,
      empleado: empleado.nombre_completo,
      puesto: empleado.puesto,
      username,
      cuenta_cliente_id: cuentaClienteId,
      auth_user_id: createdAuth.user.id,
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId,
  })

  let deliveryMessage =
    'Usuario creado con password temporal listo para activacion.'

  if (empleado.correo_electronico && canSendProvisionalCredentialsEmail()) {
    try {
      const appUrl = await obtenerUrlBaseAplicacion()
      await sendProvisionalCredentialsEmail({
        to: empleado.correo_electronico,
        employeeName: empleado.nombre_completo,
        username,
        temporaryPassword,
        loginUrl: `${appUrl}/login`,
      })

      await registrarEventoAudit(service, {
        tabla: 'usuario',
        registroId: insertedUser.id,
        payload: {
          evento: 'usuario_credenciales_provisionales_enviadas',
          username,
          destino: empleado.correo_electronico,
        },
        usuarioId: actor.usuarioId,
        cuentaClienteId,
      })

      deliveryMessage =
        'Usuario creado y credenciales provisionales enviadas al correo del empleado.'
    } catch (error) {
      await registrarEventoAudit(service, {
        tabla: 'usuario',
        registroId: insertedUser.id,
        payload: {
          evento: 'usuario_credenciales_provisionales_error_email',
          username,
          destino: empleado.correo_electronico,
          error: error instanceof Error ? error.message : 'unknown_email_error',
        },
        usuarioId: actor.usuarioId,
        cuentaClienteId,
      })

      deliveryMessage =
        'Usuario creado, pero el envio de credenciales por correo fallo. Comparte temporalmente las credenciales por un canal alterno y revisa la configuracion de email.'
    }
  } else if (empleado.correo_electronico) {
    deliveryMessage =
      'Usuario creado. Hay correo del empleado, pero el canal de email no esta configurado; comparte temporalmente las credenciales por un canal alterno.'
  } else {
    deliveryMessage =
      'Usuario creado. El empleado no tiene correo registrado, asi que las credenciales deben compartirse por un canal alterno.'
  }

  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message: deliveryMessage,
    generatedUsername: username,
    temporaryPassword,
    temporaryEmail,
  })
}

export async function actualizarPuestoUsuario(
  _prevState: UsuarioAdminActionState,
  formData: FormData
): Promise<UsuarioAdminActionState> {
  const actor = await requerirAdministradorActivo()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const usuarioId = String(formData.get('usuario_id') ?? '').trim()
  const puestoDestino = String(formData.get('puesto_destino') ?? '').trim() as Puesto

  if (!usuarioId) {
    return buildState({ message: 'Selecciona un usuario valido.' })
  }

  if (!PUESTOS_DISPONIBLES.includes(puestoDestino)) {
    return buildState({ message: 'El puesto destino no es valido.' })
  }

  if (actor.usuarioId === usuarioId && puestoDestino !== 'ADMINISTRADOR') {
    return buildState({
      message: 'No se permite degradar tu propio puesto de administrador desde este modulo.',
    })
  }

  const { data: usuario, error: usuarioError } = await service
    .from('usuario')
    .select(`
      id,
      auth_user_id,
      empleado_id,
      cuenta_cliente_id,
      username,
      estado_cuenta,
      correo_verificado,
      correo_electronico,
      empleado:empleado_id(nombre_completo, puesto),
      cuenta_cliente:cuenta_cliente_id(nombre, identificador)
    `)
    .eq('id', usuarioId)
    .maybeSingle()

  if (usuarioError || !usuario) {
    return buildState({
      message: usuarioError?.message ?? 'No fue posible cargar el usuario solicitado.',
    })
  }

  const empleado = obtenerPrimero((usuario as unknown as UsuarioGestionRow).empleado)

  if (!empleado) {
    return buildState({ message: 'El usuario no tiene empleado operativo asociado.' })
  }

  if (empleado.puesto === puestoDestino) {
    return buildState({ ok: true, message: 'El usuario ya tiene ese puesto.' })
  }

  if (puestoDestino === 'CLIENTE' && !usuario.cuenta_cliente_id) {
    return buildState({
      message: 'Vincula primero una cuenta cliente antes de mover el usuario a puesto CLIENTE.',
    })
  }

  const { error: updateError } = await service
    .from('empleado')
    .update({
      puesto: puestoDestino,
      updated_at: new Date().toISOString(),
    })
    .eq('id', usuario.empleado_id)

  if (updateError) {
    return buildState({ message: updateError.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'usuario',
    registroId: usuario.id,
    payload: {
      evento: 'usuario_cambio_puesto_admin',
      empleado: empleado.nombre_completo,
      username: usuario.username,
      puesto_anterior: empleado.puesto,
      puesto_nuevo: puestoDestino,
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: usuario.cuenta_cliente_id,
  })

  revalidatePath('/admin/users')
  revalidatePath('/dashboard')

  return buildState({
    ok: true,
    message: `Puesto actualizado de ${empleado.puesto} a ${puestoDestino}.`,
  })
}

export async function actualizarEstadoCuentaUsuario(
  _prevState: UsuarioAdminActionState,
  formData: FormData
): Promise<UsuarioAdminActionState> {
  const actor = await requerirAdministradorActivo()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const usuarioId = String(formData.get('usuario_id') ?? '').trim()
  const accionCuenta = String(formData.get('accion_cuenta') ?? '').trim() as AccionCuenta

  if (!usuarioId) {
    return buildState({ message: 'Selecciona un usuario valido.' })
  }

  if (accionCuenta !== 'SUSPENDER' && accionCuenta !== 'REACTIVAR') {
    return buildState({ message: 'La accion solicitada no es valida.' })
  }

  if (actor.usuarioId === usuarioId && accionCuenta === 'SUSPENDER') {
    return buildState({
      message: 'No se permite suspender tu propia cuenta desde este modulo.',
    })
  }

  const { data: usuario, error: usuarioError } = await service
    .from('usuario')
    .select(`
      id,
      auth_user_id,
      empleado_id,
      cuenta_cliente_id,
      username,
      estado_cuenta,
      correo_verificado,
      correo_electronico,
      empleado:empleado_id(nombre_completo, puesto),
      cuenta_cliente:cuenta_cliente_id(nombre, identificador)
    `)
    .eq('id', usuarioId)
    .maybeSingle()

  if (usuarioError || !usuario) {
    return buildState({
      message: usuarioError?.message ?? 'No fue posible cargar el usuario solicitado.',
    })
  }

  const empleado = obtenerPrimero((usuario as unknown as UsuarioGestionRow).empleado)

  if (!empleado) {
    return buildState({ message: 'El usuario no tiene empleado operativo asociado.' })
  }

  let estadoDestino: EstadoCuenta

  if (accionCuenta === 'SUSPENDER') {
    if (usuario.estado_cuenta === 'SUSPENDIDA') {
      return buildState({ ok: true, message: 'La cuenta ya estaba suspendida.' })
    }

    if (usuario.estado_cuenta === 'BAJA') {
      return buildState({ message: 'Las cuentas en BAJA no pueden suspenderse nuevamente.' })
    }

    estadoDestino = 'SUSPENDIDA'
  } else {
    if (usuario.estado_cuenta === 'BAJA') {
      return buildState({ message: 'Las cuentas en BAJA no pueden reactivarse desde este modulo.' })
    }

    if (usuario.estado_cuenta !== 'SUSPENDIDA') {
      return buildState({ ok: true, message: 'La cuenta ya se encuentra operativa.' })
    }

    estadoDestino = usuario.correo_verificado
      ? 'ACTIVA'
      : usuario.correo_electronico
        ? 'PENDIENTE_VERIFICACION_EMAIL'
        : 'PROVISIONAL'
  }

  const { error: updateError } = await service
    .from('usuario')
    .update({
      estado_cuenta: estadoDestino,
      updated_at: new Date().toISOString(),
    })
    .eq('id', usuario.id)

  if (updateError) {
    return buildState({ message: updateError.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'usuario',
    registroId: usuario.id,
    payload: {
      evento:
        accionCuenta === 'SUSPENDER'
          ? 'usuario_suspendido_admin'
          : 'usuario_reactivado_admin',
      empleado: empleado.nombre_completo,
      username: usuario.username,
      estado_anterior: usuario.estado_cuenta,
      estado_nuevo: estadoDestino,
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: usuario.cuenta_cliente_id,
  })

  revalidatePath('/admin/users')
  revalidatePath('/dashboard')

  return buildState({
    ok: true,
    message:
      accionCuenta === 'SUSPENDER'
        ? 'Cuenta suspendida correctamente.'
        : `Cuenta reactivada en estado ${estadoDestino}.`,
  })
}

export async function enviarResetPasswordUsuario(
  _prevState: UsuarioAdminActionState,
  formData: FormData
): Promise<UsuarioAdminActionState> {
  const actor = await requerirAdministradorActivo()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const usuarioId = String(formData.get('usuario_id') ?? '').trim()

  if (!usuarioId) {
    return buildState({ message: 'Selecciona un usuario valido.' })
  }

  const { data: usuario, error: usuarioError } = await service
    .from('usuario')
    .select(`
      id,
      auth_user_id,
      empleado_id,
      cuenta_cliente_id,
      username,
      estado_cuenta,
      correo_verificado,
      correo_electronico,
      empleado:empleado_id(nombre_completo, puesto),
      cuenta_cliente:cuenta_cliente_id(nombre, identificador)
    `)
    .eq('id', usuarioId)
    .maybeSingle()

  if (usuarioError || !usuario) {
    return buildState({
      message: usuarioError?.message ?? 'No fue posible cargar el usuario solicitado.',
    })
  }

  if (!usuario.auth_user_id) {
    return buildState({
      message: 'La cuenta todavia no esta vinculada a auth.users y no puede recibir reset.',
    })
  }

  if (usuario.estado_cuenta !== 'ACTIVA') {
    return buildState({
      message: 'Solo las cuentas activas pueden recibir un email de recuperacion.',
    })
  }

  const { data: authData, error: authError } = await service.auth.admin.getUserById(
    usuario.auth_user_id
  )

  if (authError || !authData.user.email) {
    return buildState({
      message:
        authError?.message ?? 'No fue posible leer el correo de acceso del usuario en auth.',
    })
  }

  if (authData.user.email.endsWith('@provisional.fieldforce.invalid')) {
    return buildState({
      message: 'La cuenta sigue en email provisional y primero debe completar activacion.',
    })
  }

  const siteUrl = await obtenerUrlBaseAplicacion()
  const { error: resetError } = await service.auth.resetPasswordForEmail(authData.user.email, {
    redirectTo: `${siteUrl}/update-password`,
  })

  if (resetError) {
    return buildState({ message: resetError.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'usuario',
    registroId: usuario.id,
    payload: {
      evento: 'usuario_reset_password_admin',
      username: usuario.username,
      destino: authData.user.email,
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: usuario.cuenta_cliente_id,
  })

  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message: `Email de recuperacion enviado a ${maskEmail(authData.user.email)}.`,
  })
}
