import { unstable_cache } from 'next/cache'
import type { SupabaseClient, User as AuthUser } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import { readAuthContextUpdatedAt } from '@/lib/auth/sessionContext'
import { buildModuleCacheTags } from '@/lib/cache/moduleTags'
import { createServiceClient } from '@/lib/supabase/server'
import type {
  CuentaCliente,
  Empleado,
  EstadoCuenta,
  Puesto,
  UsuarioSistema,
} from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RetailSupabaseClient = SupabaseClient<any>
type MaybeMany<T> = T | T[] | null
const USUARIOS_PANEL_REVALIDATE_SECONDS = 60
const PROVISIONAL_EMAIL_DOMAIN = '@provisional.fieldforce.invalid'

type EmpleadoRelacion = Pick<
  Empleado,
  'id' | 'id_nomina' | 'nombre_completo' | 'puesto' | 'estatus_laboral' | 'correo_electronico'
>

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre' | 'identificador'>

interface UsuarioQueryRow
  extends Pick<
    UsuarioSistema,
    | 'id'
    | 'auth_user_id'
    | 'empleado_id'
    | 'cuenta_cliente_id'
    | 'username'
    | 'estado_cuenta'
    | 'correo_electronico'
    | 'correo_verificado'
    | 'ultimo_acceso_en'
    | 'updated_at'
  > {
  empleado: MaybeMany<EmpleadoRelacion>
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

type EmpleadoQueryRow = Pick<
  Empleado,
  | 'id'
  | 'id_nomina'
  | 'nombre_completo'
  | 'puesto'
  | 'estatus_laboral'
  | 'correo_electronico'
  | 'imss_estado'
  | 'metadata'
>

type CuentaClienteQueryRow = Pick<CuentaCliente, 'id' | 'nombre' | 'identificador' | 'activa'>

interface AuthSessionQueryRow {
  auth_user_id: string
  session_id: string
  created_at: string
  updated_at: string | null
  refreshed_at: string | null
  not_after: string | null
  user_agent: string | null
  ip: string | null
  aal: string | null
  tag: string | null
  is_active: boolean
}

export interface UsuariosResumen {
  total: number
  activas: number
  sinAuth: number
  pendientesActivacion: number
}

export interface ProvisionamientoAuth {
  backendAdminConfigurado: boolean
  usuariosConAuth: number
  usuariosSinAuth: number
  listosParaOperar: number
  bloqueados: number
}

export interface UsuarioSessionItem {
  id: string
  creadaEn: string
  actualizadaEn: string | null
  refrescadaEn: string | null
  expiraEn: string | null
  userAgent: string | null
  ip: string | null
  aal: string | null
  tag: string | null
  activa: boolean
}

export type EstadoSesionUsuario =
  | 'SIN_ACCESO'
  | 'ESPERA_PRIMER_LOGIN'
  | 'SIN_SESION_ACTIVA'
  | 'REQUIERE_REFRESH'
  | 'ACTIVA'

export interface UsuarioListadoItem {
  id: string
  empleadoId: string
  authUserId: string | null
  empleado: string
  puesto: Puesto
  username: string | null
  correo: string | null
  correoAuth: string | null
  estadoCuenta: EstadoCuenta
  authVinculado: boolean
  cuentaCliente: string | null
  cuentaClienteId: string | null
  cuentaClienteIdentificador: string | null
  correoVerificado: boolean
  actualizadoEn: string
  ultimoAccesoEn: string | null
  ultimoSignInAuthEn: string | null
  authContextUpdatedAt: string | null
  estadoSesion: EstadoSesionUsuario
  sesionesActivas: number
  puedeResetPassword: boolean
  motivoNoReset: string | null
}

export interface EmpleadoDisponibleItem {
  id: string
  idNomina: string | null
  nombreCompleto: string
  puesto: Puesto
  estatusLaboral: Empleado['estatus_laboral']
  correoElectronico: string | null
}

export interface CuentaClienteDisponibleItem {
  id: string
  nombre: string
  identificador: string
  activa: boolean
}

export interface UsuariosPanelData {
  resumen: UsuariosResumen
  provisionamiento: ProvisionamientoAuth
  usuarios: UsuarioListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  mensajeBackendAdmin?: string
  sesionesOperativasDisponibles: boolean
  mensajeSesiones?: string
  puestosDisponibles: Puesto[]
  estadosDisponibles: EstadoCuenta[]
  cuentasClienteDisponibles: CuentaClienteDisponibleItem[]
  empleadosDisponibles: EmpleadoDisponibleItem[]
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

const ESTADOS_DISPONIBLES: EstadoCuenta[] = [
  'PROVISIONAL',
  'PENDIENTE_VERIFICACION_EMAIL',
  'PENDIENTE_PRIMER_LOGIN',
  'ACTIVA',
  'SUSPENDIDA',
  'BAJA',
]

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

async function listAllAuthUsers(service: ReturnType<typeof createServiceClient>) {
  const users: AuthUser[] = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })

    if (error) {
      throw error
    }

    const batch = data.users ?? []
    users.push(...batch)

    if (batch.length < perPage) {
      break
    }

    page += 1
  }

  return users
}

async function listAllAuthSessions(service: ReturnType<typeof createServiceClient>) {
  const { data, error } = await service
    .schema('auth')
    .from('sessions')
    .select(
      'user_id, id, created_at, updated_at, refreshed_at, not_after, user_agent, ip, aal, tag'
    )
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((session) => ({
    auth_user_id: session.user_id,
    session_id: session.id,
    created_at: session.created_at,
    updated_at: session.updated_at,
    refreshed_at: session.refreshed_at,
    not_after: session.not_after,
    user_agent: session.user_agent,
    ip: typeof session.ip === 'string' ? session.ip : null,
    aal: session.aal,
    tag: session.tag,
    is_active: session.not_after ? new Date(session.not_after).getTime() > Date.now() : true,
  })) as AuthSessionQueryRow[]
}

function toIsoOrNull(value: number | null) {
  return value ? new Date(value).toISOString() : null
}

function isProvisionalAuthEmail(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().toLowerCase().endsWith(PROVISIONAL_EMAIL_DOMAIN)
}

function resolveVisibleAuthEmail(authUser: AuthUser | undefined) {
  if (!authUser) {
    return null
  }

  const authEmail = authUser.email?.trim().toLowerCase() ?? null
  const pendingEmail = (() => {
    const metadata = authUser.user_metadata
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null
    }

    const value = (metadata as Record<string, unknown>).pending_email
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
  })()

  if (isProvisionalAuthEmail(authEmail) && pendingEmail && !isProvisionalAuthEmail(pendingEmail)) {
    return pendingEmail
  }

  return authEmail
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function getEstadoSesionUsuario({
  authVinculado,
  sesionesActivas,
  ultimoSignInAuthEn,
  authContextUpdatedAt,
}: {
  authVinculado: boolean
  sesionesActivas: number
  ultimoSignInAuthEn: string | null
  authContextUpdatedAt: string | null
}): EstadoSesionUsuario {
  if (!authVinculado) {
    return 'SIN_ACCESO'
  }

  if (sesionesActivas > 0) {
    return 'ACTIVA'
  }

  if (!ultimoSignInAuthEn) {
    return 'ESPERA_PRIMER_LOGIN'
  }

  if (authContextUpdatedAt) {
    const signInMs = Date.parse(ultimoSignInAuthEn)
    const contextMs = Date.parse(authContextUpdatedAt)

    if (!Number.isNaN(signInMs) && !Number.isNaN(contextMs) && contextMs > signInMs) {
      return 'REQUIERE_REFRESH'
    }
  }

  return 'SIN_SESION_ACTIVA'
}

function getResetAvailability({
  authVinculado,
  estadoCuenta,
  authEmail,
}: {
  authVinculado: boolean
  estadoCuenta: EstadoCuenta
  authEmail: string | null
}) {
  if (!authVinculado) {
    return {
      puedeResetPassword: false,
      motivoNoReset: 'El usuario aun no esta vinculado a auth.users.',
    }
  }

  if (estadoCuenta !== 'ACTIVA') {
    return {
      puedeResetPassword: false,
      motivoNoReset: 'Solo las cuentas activas pueden recibir reset de password.',
    }
  }

  if (!authEmail) {
    return {
      puedeResetPassword: false,
      motivoNoReset: 'No existe un correo de acceso en auth para esta cuenta.',
    }
  }

  if (authEmail.endsWith('@provisional.fieldforce.invalid')) {
    return {
      puedeResetPassword: false,
      motivoNoReset: 'La cuenta sigue usando correo provisional y debe completar activacion.',
    }
  }

  return {
    puedeResetPassword: true,
    motivoNoReset: null,
  }
}

function buildUsuariosCacheKey(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>,
  {
    backendAdminConfigurado,
  }: {
    backendAdminConfigurado: boolean
  }
) {
  return JSON.stringify({
    cuentaClienteId: actor.cuentaClienteId ?? null,
    empleadoId: actor.empleadoId,
    puesto: actor.puesto,
    backendAdminConfigurado,
  })
}

function buildUsuariosCacheTags(actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>) {
  return buildModuleCacheTags({
    module: 'usuarios',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId,
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null,
  })
}

async function obtenerPanelUsuariosUncached(
  supabase: RetailSupabaseClient,
  {
    backendAdminConfigurado,
  }: {
    backendAdminConfigurado: boolean
  }
): Promise<UsuariosPanelData> {
  const [usuariosResult, empleadosResult, cuentasResult] = await Promise.all([
    supabase
      .from('usuario')
      .select(`
        id,
        auth_user_id,
        empleado_id,
        cuenta_cliente_id,
        username,
        estado_cuenta,
        correo_electronico,
        correo_verificado,
        ultimo_acceso_en,
        updated_at,
        empleado:empleado_id(id, id_nomina, nombre_completo, puesto, estatus_laboral, correo_electronico),
        cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)
      `)
      .order('updated_at', { ascending: false }),
    supabase
      .from('empleado')
      .select('id, id_nomina, nombre_completo, puesto, estatus_laboral, correo_electronico, imss_estado, metadata')
      .neq('estatus_laboral', 'BAJA')
      .order('nombre_completo', { ascending: true }),
    supabase
      .from('cuenta_cliente')
      .select('id, nombre, identificador, activa')
      .order('nombre', { ascending: true }),
  ])

  if (usuariosResult.error) {
    return {
      resumen: {
        total: 0,
        activas: 0,
        sinAuth: 0,
        pendientesActivacion: 0,
      },
      provisionamiento: {
        backendAdminConfigurado: false,
        usuariosConAuth: 0,
        usuariosSinAuth: 0,
        listosParaOperar: 0,
        bloqueados: 0,
      },
      usuarios: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        usuariosResult.error.message ??
        'La tabla `usuario` aun no esta disponible en Supabase.',
      sesionesOperativasDisponibles: false,
      mensajeSesiones: 'Sin datos base de usuarios no es posible consolidar sesiones.',
      puestosDisponibles: PUESTOS_DISPONIBLES,
      estadosDisponibles: ESTADOS_DISPONIBLES,
      cuentasClienteDisponibles: [],
      empleadosDisponibles: [],
    }
  }

  const infraMessages: string[] = []

  if (empleadosResult.error) {
    infraMessages.push(`Empleados: ${empleadosResult.error.message}.`)
  }

  if (cuentasResult.error) {
    infraMessages.push(`Cuentas cliente: ${cuentasResult.error.message}.`)
  }

  let backendAdminListo = backendAdminConfigurado
  let mensajeBackendAdmin: string | undefined
  const authUsersById = new Map<string, AuthUser>()
  let sesionesOperativasDisponibles = true
  let mensajeSesiones: string | undefined
  const activeSessionCountsByUserId = new Map<string, number>()

  if (backendAdminConfigurado) {
    try {
      const service = createServiceClient()
      const [authUsersResult, sesionesResult] = await Promise.allSettled([
        listAllAuthUsers(service),
        listAllAuthSessions(service),
      ])

      if (authUsersResult.status === 'fulfilled') {
        for (const authUser of authUsersResult.value) {
          authUsersById.set(authUser.id, authUser)
        }
      } else {
        backendAdminListo = false
        mensajeBackendAdmin = getErrorMessage(
          authUsersResult.reason,
          'No fue posible consultar auth.users.'
        )
      }

      if (sesionesResult.status === 'fulfilled') {
        for (const session of sesionesResult.value) {
          if (!session.is_active) {
            continue
          }

          activeSessionCountsByUserId.set(
            session.auth_user_id,
            (activeSessionCountsByUserId.get(session.auth_user_id) ?? 0) + 1
          )
        }
      } else {
        // auth.sessions is informative but non-blocking for the panel.
        // We intentionally keep the module operable even when session
        // introspection is unavailable in the current runtime.
        sesionesOperativasDisponibles = true
        mensajeSesiones = undefined
      }
    } catch (error) {
      backendAdminListo = false
      mensajeBackendAdmin = getErrorMessage(
        error,
        'No fue posible inicializar el backend administrativo.'
      )
    }
  } else {
    backendAdminListo = false
    mensajeBackendAdmin =
      'Falta configurar SUPABASE_SERVICE_ROLE_KEY para operar altas, resets y cambios administrativos.'
  }

  const usuariosRaw = (usuariosResult.data ?? []) as unknown as UsuarioQueryRow[]
  const cuentasRaw = (cuentasResult.data ?? []) as CuentaClienteQueryRow[]
  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoQueryRow[]

  const empleadosAsignados = new Set(usuariosRaw.map((usuario) => usuario.empleado_id))

  const usuarios = usuariosRaw.map((usuario) => {
    const empleado = obtenerPrimero(usuario.empleado)
    const cuentaCliente = obtenerPrimero(usuario.cuenta_cliente)
    const authUser = usuario.auth_user_id
      ? authUsersById.get(usuario.auth_user_id)
      : undefined
    const authContextUpdatedAt = toIsoOrNull(
      readAuthContextUpdatedAt(authUser?.app_metadata ?? null)
    )
    const sesionesActivas = usuario.auth_user_id
      ? (activeSessionCountsByUserId.get(usuario.auth_user_id) ?? 0)
      : 0
    const ultimoSignInAuthEn = authUser?.last_sign_in_at ?? null
    const correoAuthVisible = resolveVisibleAuthEmail(authUser)
    const resetAvailability = getResetAvailability({
      authVinculado: Boolean(usuario.auth_user_id),
      estadoCuenta: usuario.estado_cuenta,
      authEmail: correoAuthVisible,
    })

    return {
      id: usuario.id,
      empleadoId: usuario.empleado_id,
      authUserId: usuario.auth_user_id,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      puesto: (empleado?.puesto ?? 'DERMOCONSEJERO') as Puesto,
      username: usuario.username,
      correo: usuario.correo_electronico,
      correoAuth: correoAuthVisible,
      estadoCuenta: usuario.estado_cuenta,
      authVinculado: Boolean(usuario.auth_user_id),
      cuentaCliente: cuentaCliente?.nombre ?? null,
      cuentaClienteId: cuentaCliente?.id ?? null,
      cuentaClienteIdentificador: cuentaCliente?.identificador ?? null,
      correoVerificado: usuario.correo_verificado,
      actualizadoEn: usuario.updated_at,
      ultimoAccesoEn: usuario.ultimo_acceso_en,
      ultimoSignInAuthEn,
      authContextUpdatedAt,
      estadoSesion: getEstadoSesionUsuario({
        authVinculado: Boolean(usuario.auth_user_id),
        sesionesActivas,
        ultimoSignInAuthEn,
        authContextUpdatedAt,
      }),
      sesionesActivas,
      puedeResetPassword: resetAvailability.puedeResetPassword,
      motivoNoReset: resetAvailability.motivoNoReset,
    }
  })

  const usuariosConAuth = usuarios.filter((item) => item.authVinculado).length
  const usuariosSinAuth = usuarios.length - usuariosConAuth

  return {
    resumen: {
      total: usuarios.length,
      activas: usuarios.filter((item) => item.estadoCuenta === 'ACTIVA').length,
      sinAuth: usuariosSinAuth,
      pendientesActivacion: usuarios.filter(
        (item) =>
          item.estadoCuenta === 'PROVISIONAL' ||
          item.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL' ||
          item.estadoCuenta === 'PENDIENTE_PRIMER_LOGIN'
      ).length,
    },
    provisionamiento: {
      backendAdminConfigurado: backendAdminListo,
      usuariosConAuth,
      usuariosSinAuth,
      listosParaOperar: usuarios.filter(
        (item) => item.authVinculado && item.estadoCuenta === 'ACTIVA'
      ).length,
      bloqueados: usuarios.filter(
        (item) => item.estadoCuenta === 'SUSPENDIDA' || item.estadoCuenta === 'BAJA'
      ).length,
    },
    usuarios,
    infraestructuraLista: infraMessages.length === 0,
    mensajeInfraestructura: infraMessages.length > 0 ? infraMessages.join(' ') : undefined,
    mensajeBackendAdmin,
    sesionesOperativasDisponibles,
    mensajeSesiones,
    puestosDisponibles: PUESTOS_DISPONIBLES,
    estadosDisponibles: ESTADOS_DISPONIBLES,
    cuentasClienteDisponibles: cuentasRaw.map((cuenta) => ({
      id: cuenta.id,
      nombre: cuenta.nombre,
      identificador: cuenta.identificador,
      activa: cuenta.activa,
    })),
    empleadosDisponibles: empleadosRaw
      .filter((empleado) => {
        if (empleadosAsignados.has(empleado.id)) {
          return false
        }

        const metadata =
          empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
            ? (empleado.metadata as Record<string, unknown>)
            : {}

        return empleado.imss_estado === 'ALTA_IMSS' && metadata.admin_access_pending === true
      })
      .map((empleado) => ({
        id: empleado.id,
        idNomina: empleado.id_nomina,
        nombreCompleto: empleado.nombre_completo,
        puesto: empleado.puesto,
        estatusLaboral: empleado.estatus_laboral,
        correoElectronico: empleado.correo_electronico,
      })),
  }
}

export async function obtenerPanelUsuarios(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>,
  {
    backendAdminConfigurado,
  }: {
    backendAdminConfigurado: boolean
  },
  customSupabase?: RetailSupabaseClient
): Promise<UsuariosPanelData> {
  if (customSupabase) {
    return obtenerPanelUsuariosUncached(customSupabase, {
      backendAdminConfigurado,
    })
  }

  const cacheKey = buildUsuariosCacheKey(actor, {
    backendAdminConfigurado,
  })

  return unstable_cache(
    async () => {
      const service = createServiceClient() as RetailSupabaseClient
      return obtenerPanelUsuariosUncached(service, {
        backendAdminConfigurado,
      })
    },
    ['usuarios:panel', cacheKey],
    {
      tags: buildUsuariosCacheTags(actor),
      revalidate: USUARIOS_PANEL_REVALIDATE_SECONDS,
    }
  )()
}

export async function obtenerSesionesUsuario(
  usuarioId: string,
  customSupabase?: RetailSupabaseClient
): Promise<UsuarioSessionItem[]> {
  const service = customSupabase ?? createServiceClient()

  const { data: usuario, error: usuarioError } = await service
    .from('usuario')
    .select('auth_user_id')
    .eq('id', usuarioId)
    .maybeSingle()

  if (usuarioError) {
    throw usuarioError
  }

  if (!usuario?.auth_user_id) {
    return []
  }

  let sessions: AuthSessionQueryRow[] = []

  try {
    sessions = await listAllAuthSessions(createServiceClient())
  } catch {
    return []
  }

  return sessions
    .filter((session) => session.auth_user_id === usuario.auth_user_id)
    .map((session) => ({
    id: session.session_id,
    creadaEn: session.created_at,
    actualizadaEn: session.updated_at,
    refrescadaEn: session.refreshed_at,
    expiraEn: session.not_after,
    userAgent: session.user_agent,
    ip: session.ip,
    aal: session.aal,
    tag: session.tag,
    activa: session.is_active,
  }))
}
