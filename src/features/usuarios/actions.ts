'use server'

// import crypto from 'node:crypto' // Desactivado para Edge
import { revalidatePath } from 'next/cache'
import { obtenerClienteAdmin, obtenerUrlBaseAplicacion } from '@/lib/auth/admin'
import { cancelarFlujosActivos } from '@/lib/auth/accessFlow'
import { reconcileActiveAccountAccessIdentity } from '@/lib/auth/accessIdentity'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { publishUiChanges } from '@/lib/ui-change/server'
import {
  buildUiChangeScope,
  buildUiChangeTargetsFromBusinessEvent,
} from '@/lib/ui-change/types'
import { resolveSingleTenantAccountId } from '@/lib/tenant/singleTenant'
import { writePrimerAccesoMetadata } from '@/lib/auth/firstAccess'
import type { Empleado, EstadoCuenta, Puesto } from '@/types/database'
import { ESTADO_USUARIO_ADMIN_INICIAL, type UsuarioAdminActionState } from './state'
import {
  canSendProvisionalCredentialsEmail,
  sendProvisionalCredentialsEmail,
} from '@/lib/notifications/provisionalCredentialsEmail'
import { sendWorkflowTransitionEmail } from '@/lib/notifications/workflowTransitionEmail'

type MaybeMany<T> = T | T[] | null
const PROVISIONAL_EMAIL_DOMAIN = '@provisional.fieldforce.invalid'

type AccionCuenta = 'SUSPENDER' | 'REACTIVAR' | 'PENDIENTE_PRIMER_LOGIN'

type EmpleadoCreateRow = Pick<
  Empleado,
  'id' | 'id_nomina' | 'nombre_completo' | 'puesto' | 'correo_electronico' | 'estatus_laboral'
> & {
  metadata: unknown
}

interface CuentaClienteRelacion {
  nombre: string
  identificador: string
}

interface EmpleadoRelacion {
  nombre_completo: string
  puesto: Puesto
  metadata: unknown
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
  const bytes = new Uint8Array(9)
  globalThis.crypto.getRandomValues(bytes)
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `Rtl!${base64}`
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

async function publishUsuariosPanelChange(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  input: {
    eventType: string
    cuentaClienteId?: string | null
    empleadoId?: string | null
    metadata?: Record<string, unknown> | null
  }
) {
  await publishUiChanges(
    buildUiChangeTargetsFromBusinessEvent({
      eventType: input.eventType,
      modules: ['usuarios'],
      surfaces: ['panel'],
      scopes: [
        buildUiChangeScope('global'),
        buildUiChangeScope('cuenta', input.cuentaClienteId ?? null),
        buildUiChangeScope('empleado', input.empleadoId ?? null),
      ],
      cuentaClienteId: input.cuentaClienteId ?? null,
      empleadoId: input.empleadoId ?? null,
      roleTargets: ['ADMINISTRADOR'],
      metadata: input.metadata ?? null,
    }),
    { service }
  )
}

async function publishEmpleadosPanelChange(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  input: {
    eventType: string
    empleadoId?: string | null
    metadata?: Record<string, unknown> | null
  }
) {
  await publishUiChanges(
    buildUiChangeTargetsFromBusinessEvent({
      eventType: input.eventType,
      modules: ['empleados'],
      surfaces: ['panel'],
      scopes: [buildUiChangeScope('global'), buildUiChangeScope('empleado', input.empleadoId ?? null)],
      empleadoId: input.empleadoId ?? null,
      roleTargets: ['ADMINISTRADOR', 'RECLUTAMIENTO', 'NOMINA'],
      metadata: input.metadata ?? null,
    }),
    { service }
  )
}

function mapMetadataRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return { ...(value as Record<string, unknown>) }
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
  const cuentaClienteId = resolveSingleTenantAccountId(
    String(formData.get('cuenta_cliente_id') ?? '').trim() || actor.cuentaClienteId
  )

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado para crear el usuario.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, id_nomina, nombre_completo, puesto, correo_electronico, estatus_laboral, metadata')
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

  const { data: cuentaCliente, error: cuentaError } = await service
    .from('cuenta_cliente')
    .select('id, activa')
    .eq('id', cuentaClienteId)
    .maybeSingle()

  if (cuentaError || !cuentaCliente || !cuentaCliente.activa) {
    return buildState({
      message:
        cuentaError?.message ?? 'La cuenta cliente ISDIN no existe o no esta activa.',
    })
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

  const metadataActual = mapMetadataRecord(empleado.metadata)
  const workflowStageActual = String(metadataActual.workflow_stage ?? '').trim() || null
  const shouldCloseRecruitingFlow =
    workflowStageActual === 'ONBOARDING' ||
    workflowStageActual === 'PENDIENTE_ACCESO_ADMIN' ||
    metadataActual.admin_access_pending === true

  if (shouldCloseRecruitingFlow) {
    const closedAt = generatedAt.toISOString()
    const { error: employeeUpdateError } = await service
      .from('empleado')
      .update({
        metadata: {
          ...metadataActual,
          workflow_stage: 'ALTA_IMSS_CERRADA',
          admin_access_pending: false,
          admin_access_cerrado_at: closedAt,
        },
        updated_at: closedAt,
      })
      .eq('id', empleado.id)

    if (employeeUpdateError) {
      await service.from('usuario').delete().eq('id', insertedUser.id)
      await service.auth.admin.deleteUser(createdAuth.user.id, true)
      return buildState({
        message:
          employeeUpdateError.message ??
          'El acceso se creo, pero no fue posible cerrar el flujo de Reclutamiento.',
      })
    }

    await registrarEventoAudit(service, {
      tabla: 'empleado',
      registroId: empleado.id,
      payload: {
        evento: 'empleado_acceso_administrativo_cerrado',
        workflow_stage_anterior: workflowStageActual,
        workflow_stage_nuevo: 'ALTA_IMSS_CERRADA',
        admin_access_pending: false,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId,
    })

    await publishEmpleadosPanelChange(service, {
      eventType: 'empleado_acceso_administrativo_cerrado',
      empleadoId: empleado.id,
      metadata: {
        workflow_stage: 'ALTA_IMSS_CERRADA',
        admin_access_pending: false,
      },
    })

    const { data: workflowRecipients } = await service
      .from('empleado')
      .select('id, nombre_completo, correo_electronico')
      .in('puesto', ['ADMINISTRADOR', 'RECLUTAMIENTO'])
      .eq('estatus_laboral', 'ACTIVO')
      .order('nombre_completo', { ascending: true })

    const appUrl = await obtenerUrlBaseAplicacion()
    await sendWorkflowTransitionEmail({
      recipients: ((workflowRecipients ?? []) as Array<{
        correo_electronico?: string | null
        nombre_completo?: string | null
      }>)
        .map((recipient) => ({
          email:
            typeof recipient.correo_electronico === 'string'
              ? recipient.correo_electronico.trim().toLowerCase()
              : null,
          name: typeof recipient.nombre_completo === 'string' ? recipient.nombre_completo : 'Destinatario',
        }))
        .filter((recipient): recipient is { email: string; name: string } => Boolean(recipient.email)),
      subject: 'Acceso provisional creado y flujo cerrado',
      body:
        `${empleado.nombre_completo} ya tiene acceso provisional y el caso quedo cerrado para Reclutamiento. ` +
        'Administracion puede continuar la operacion.',
      ctaLabel: 'Abrir expediente',
      ctaUrl: `${appUrl}/empleados?tab=reclutamiento`,
    })
  }

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

  await publishUsuariosPanelChange(service, {
    eventType: 'usuario_admin_creado',
    cuentaClienteId,
    empleadoId: empleado.id,
    metadata: {
      usuarioId: insertedUser.id,
      authUserId: createdAuth.user.id,
      username,
    },
  })

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
      empleado:empleado_id(nombre_completo, puesto, metadata),
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

  await publishUsuariosPanelChange(service, {
    eventType: 'usuario_puesto_actualizado',
    cuentaClienteId: usuario.cuenta_cliente_id,
    empleadoId: usuario.empleado_id,
    metadata: {
      usuarioId: usuario.id,
      puestoAnterior: empleado.puesto,
      puestoNuevo: puestoDestino,
    },
  })

  return buildState({
    ok: true,
    message: `Puesto actualizado de ${empleado.puesto} a ${puestoDestino}.`,
  })
}

export async function actualizarUsernameUsuario(
  _prevState: UsuarioAdminActionState,
  formData: FormData
): Promise<UsuarioAdminActionState> {
  const actor = await requerirAdministradorActivo()
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const usuarioId = String(formData.get('usuario_id') ?? '').trim()
  const usernameDestino = sanitizeToken(String(formData.get('username_destino') ?? '').trim())

  if (!usuarioId) {
    return buildState({ message: 'Selecciona un usuario valido.' })
  }

  if (!usernameDestino) {
    return buildState({
      message: 'Captura un username valido usando letras, numeros, guion, punto o guion bajo.',
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

  if (
    usuario.estado_cuenta !== 'PROVISIONAL' &&
    usuario.estado_cuenta !== 'PENDIENTE_VERIFICACION_EMAIL' &&
    usuario.estado_cuenta !== 'PENDIENTE_PRIMER_LOGIN'
  ) {
    return buildState({
      message:
        'Solo las cuentas provisionales, pendientes de verificacion o pendiente primer login pueden cambiar username desde este modulo.',
    })
  }

  const usernameActual = sanitizeToken(usuario.username ?? '')

  if (usernameActual === usernameDestino) {
    return buildState({ ok: true, message: 'El usuario ya tiene ese username.' })
  }

  const { data: usernameOcupado, error: usernameError } = await service
    .from('usuario')
    .select('id')
    .eq('username', usernameDestino)
    .maybeSingle()

  if (usernameError) {
    return buildState({ message: usernameError.message })
  }

  if (usernameOcupado && usernameOcupado.id !== usuario.id) {
    return buildState({
      message: 'Ese username ya esta ocupado por otro usuario. Elige uno diferente.',
    })
  }

  const now = new Date().toISOString()
  const { error: updateError } = await service
    .from('usuario')
    .update({
      username: usernameDestino,
      updated_at: now,
    })
    .eq('id', usuario.id)

  if (updateError) {
    return buildState({ message: updateError.message })
  }

  let correoAuthActualizado: string | null = null

  if (usuario.auth_user_id) {
    const { data: authData, error: authError } = await service.auth.admin.getUserById(usuario.auth_user_id)

    if (authError || !authData.user) {
      await service
        .from('usuario')
        .update({
          username: usuario.username,
          updated_at: now,
        })
        .eq('id', usuario.id)
      return buildState({
        message:
          authError?.message ?? 'No fue posible leer la cuenta vinculada en auth para sincronizar el username.',
      })
    }

    const currentMetadata =
      authData.user.user_metadata && typeof authData.user.user_metadata === 'object'
        ? { ...(authData.user.user_metadata as Record<string, unknown>) }
        : {}

    const currentEmail = authData.user.email ?? null
    const nextEmail =
      currentEmail && currentEmail.endsWith(PROVISIONAL_EMAIL_DOMAIN)
        ? buildPlaceholderEmail(usernameDestino)
        : undefined

    const { error: authUpdateError } = await service.auth.admin.updateUserById(usuario.auth_user_id, {
      ...(nextEmail ? { email: nextEmail, email_confirm: true } : {}),
      user_metadata: {
        ...currentMetadata,
        username: usernameDestino,
        previous_username: usernameActual || null,
        username_updated_by_admin: true,
        username_updated_at: now,
      },
    })

    if (authUpdateError) {
      await service
        .from('usuario')
        .update({
          username: usuario.username,
          updated_at: now,
        })
        .eq('id', usuario.id)
      return buildState({
        message:
          authUpdateError.message ??
          'No fue posible sincronizar el username con la cuenta de autenticacion.',
      })
    }

    correoAuthActualizado = nextEmail ?? currentEmail
  }

  await registrarEventoAudit(service, {
    tabla: 'usuario',
    registroId: usuario.id,
    payload: {
      evento: 'usuario_cambio_username_admin',
      empleado: empleado.nombre_completo,
      puesto: empleado.puesto,
      username_anterior: usuario.username,
      username_nuevo: usernameDestino,
      correo_auth_actualizado: correoAuthActualizado,
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: usuario.cuenta_cliente_id,
  })

  await publishUsuariosPanelChange(service, {
    eventType: 'usuario_username_actualizado',
    cuentaClienteId: usuario.cuenta_cliente_id,
    empleadoId: usuario.empleado_id,
    metadata: {
      usuarioId: usuario.id,
      usernameAnterior: usuario.username,
      usernameNuevo: usernameDestino,
      correoAuthActualizado,
    },
  })

  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message: `Username actualizado a ${usernameDestino}.`,
    generatedUsername: usernameDestino,
    temporaryEmail: correoAuthActualizado,
  })
}

async function reiniciarAccesoProvisionalUsuario(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  actorUsuarioId: string,
  usuario: UsuarioGestionRow,
  empleado: EmpleadoRelacion,
  cuentaClienteId: string | null
): Promise<UsuarioAdminActionState> {
  if (!usuario.auth_user_id) {
    return buildState({
      message: 'La cuenta todavia no esta vinculada a auth.users y no puede reiniciarse.',
    })
  }

  if (!usuario.username) {
    return buildState({
      message: 'El usuario no tiene username y no se puede reiniciar su acceso provisional.',
    })
  }

  if (usuario.estado_cuenta === 'BAJA') {
    return buildState({
      message: 'Las cuentas en BAJA no pueden reiniciarse desde este modulo.',
    })
  }

  if (usuario.estado_cuenta === 'SUSPENDIDA') {
    return buildState({
      message: 'Primero reactiva la cuenta antes de reiniciar su acceso provisional.',
    })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const horasVigencia = await obtenerHorasPasswordTemporal(service)
  const expiresAtIso = new Date(now.getTime() + horasVigencia * 60 * 60 * 1000).toISOString()
  const temporaryPassword = createTemporaryPassword()
  const temporaryEmail = buildPlaceholderEmail(usuario.username)

  await cancelarFlujosActivos(usuario.id)

  const { error: authUpdateError } = await service.auth.admin.updateUserById(usuario.auth_user_id, {
    email: temporaryEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      username: usuario.username,
      source: 'admin_users_module',
      provisional_email: true,
      allow_username_login: true,
      pending_email: null,
      email_verified: false,
      first_access_password: true,
      confirmed_email: temporaryEmail,
      activated_at: null,
    },
  })

  if (authUpdateError) {
    return buildState({
      message: authUpdateError.message,
    })
  }

  const { error: usuarioError } = await service
    .from('usuario')
    .update({
      estado_cuenta: 'PROVISIONAL',
      correo_electronico: null,
      correo_verificado: false,
      password_temporal_generada_en: nowIso,
      password_temporal_expira_en: expiresAtIso,
      ultimo_acceso_en: null,
      updated_at: nowIso,
    })
    .eq('id', usuario.id)

  if (usuarioError) {
    return buildState({ message: usuarioError.message })
  }

  const primerAccesoRearmado = writePrimerAccesoMetadata(empleado.metadata, {
    required: true,
    estado: 'PENDIENTE',
    source: 'admin_users_module',
    reviewedAt: null,
    correctionRequestedAt: null,
    correctionNote: null,
    correctionMessageId: null,
  })

  const { error: empleadoError } = await service
    .from('empleado')
    .update({
      metadata: primerAccesoRearmado,
      updated_at: nowIso,
    })
    .eq('id', usuario.empleado_id)

  if (empleadoError) {
    return buildState({ message: empleadoError.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'usuario',
    registroId: usuario.id,
    payload: {
      evento: 'usuario_reinicio_acceso_provisional_admin',
      empleado: empleado.nombre_completo,
      username: usuario.username,
      estado_anterior: usuario.estado_cuenta,
      estado_nuevo: 'PROVISIONAL',
      correo_anterior: usuario.correo_electronico,
      correo_auth_provisional: temporaryEmail,
    },
    usuarioId: actorUsuarioId,
    cuentaClienteId,
  })

  await publishUsuariosPanelChange(service, {
    eventType: 'usuario_acceso_provisional_reiniciado',
    cuentaClienteId,
    empleadoId: usuario.empleado_id,
    metadata: {
      usuarioId: usuario.id,
      username: usuario.username,
      estadoAnterior: usuario.estado_cuenta,
      estadoNuevo: 'PROVISIONAL',
    },
  })

  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message:
      'Acceso provisional reiniciado. Comparte las credenciales nuevas para que el usuario vuelva a empezar desde cero.',
    generatedUsername: usuario.username,
    temporaryPassword,
    temporaryEmail,
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

  if (
    accionCuenta !== 'SUSPENDER' &&
    accionCuenta !== 'REACTIVAR' &&
    accionCuenta !== 'PENDIENTE_PRIMER_LOGIN'
  ) {
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
      empleado:empleado_id(nombre_completo, puesto, metadata),
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

  if (accionCuenta === 'SUSPENDER') {
    if (usuario.estado_cuenta === 'SUSPENDIDA') {
      return buildState({ ok: true, message: 'La cuenta ya estaba suspendida.' })
    }

    if (usuario.estado_cuenta === 'BAJA') {
      return buildState({ message: 'Las cuentas en BAJA no pueden suspenderse nuevamente.' })
    }

    const now = new Date().toISOString()
    const { error: updateError } = await service
      .from('usuario')
      .update({
        estado_cuenta: 'SUSPENDIDA',
        updated_at: now,
      })
      .eq('id', usuario.id)

    if (updateError) {
      return buildState({ message: updateError.message })
    }

    await registrarEventoAudit(service, {
      tabla: 'usuario',
      registroId: usuario.id,
      payload: {
        evento: 'usuario_suspendido_admin',
        empleado: empleado.nombre_completo,
        username: usuario.username,
        estado_anterior: usuario.estado_cuenta,
        estado_nuevo: 'SUSPENDIDA',
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: usuario.cuenta_cliente_id,
    })

    await publishUsuariosPanelChange(service, {
      eventType: 'usuario_cuenta_suspendida',
      cuentaClienteId: usuario.cuenta_cliente_id,
      empleadoId: usuario.empleado_id,
      metadata: {
        usuarioId: usuario.id,
        estadoAnterior: usuario.estado_cuenta,
        estadoNuevo: 'SUSPENDIDA',
      },
    })

    revalidatePath('/admin/users')

    return buildState({
      ok: true,
      message: 'Cuenta suspendida correctamente.',
    })
  }

  if (accionCuenta === 'PENDIENTE_PRIMER_LOGIN') {
    return reiniciarAccesoProvisionalUsuario(
      service,
      actor.usuarioId,
      usuario as UsuarioGestionRow,
      empleado as EmpleadoRelacion,
      usuario.cuenta_cliente_id
    )
  }

  if (usuario.estado_cuenta === 'BAJA') {
    return buildState({ message: 'Las cuentas en BAJA no pueden reactivarse desde este modulo.' })
  }

  if (usuario.estado_cuenta !== 'SUSPENDIDA') {
    return buildState({ ok: true, message: 'La cuenta ya se encuentra operativa.' })
  }

  const estadoDestino: EstadoCuenta = usuario.correo_verificado
    ? 'ACTIVA'
    : usuario.correo_electronico
      ? 'PENDIENTE_VERIFICACION_EMAIL'
      : 'PROVISIONAL'

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
      evento: 'usuario_reactivado_admin',
      empleado: empleado.nombre_completo,
      username: usuario.username,
      estado_anterior: usuario.estado_cuenta,
      estado_nuevo: estadoDestino,
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: usuario.cuenta_cliente_id,
  })

  await publishUsuariosPanelChange(service, {
    eventType: 'usuario_cuenta_reactivada',
    cuentaClienteId: usuario.cuenta_cliente_id,
    empleadoId: usuario.empleado_id,
    metadata: {
      usuarioId: usuario.id,
      estadoAnterior: usuario.estado_cuenta,
      estadoNuevo: estadoDestino,
    },
  })

  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message: `Cuenta reactivada en estado ${estadoDestino}.`,
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

  let destinoReset = usuario.correo_electronico

  try {
    const reconciledIdentity = await reconcileActiveAccountAccessIdentity(service, usuario)
    destinoReset = reconciledIdentity.canonicalEmail
  } catch (error) {
    return buildState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible reconciliar el correo de acceso del usuario.',
    })
  }

  if (!destinoReset) {
    return buildState({
      message: 'No fue posible resolver el correo final del usuario para enviar la recuperacion.',
    })
  }

  const siteUrl = await obtenerUrlBaseAplicacion()
  const { error: resetError } = await service.auth.resetPasswordForEmail(destinoReset, {
    redirectTo: `${siteUrl}/api/auth/confirm?next=/update-password`,
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
      destino: destinoReset,
    },
    usuarioId: actor.usuarioId,
    cuentaClienteId: usuario.cuenta_cliente_id,
  })

  await publishUsuariosPanelChange(service, {
    eventType: 'usuario_reset_password_enviado',
    cuentaClienteId: usuario.cuenta_cliente_id,
    empleadoId: usuario.empleado_id,
    metadata: {
      usuarioId: usuario.id,
      destino: destinoReset,
    },
  })

  return buildState({
    ok: true,
    message: `Email de recuperacion enviado a ${maskEmail(destinoReset)}.`,
  })
}
