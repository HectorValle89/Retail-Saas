import type { SupabaseClient, User as AuthUser } from '@supabase/supabase-js'
import { readAuthContextUpdatedAt } from '@/lib/auth/sessionContext'
import { createServiceClient } from '@/lib/supabase/server'
import type {
  CuentaCliente,
  Database,
  Empleado,
  EstadoCuenta,
  Puesto,
  UsuarioSistema,
} from '@/types/database'

type RetailSupabaseClient = SupabaseClient<Database>
type MaybeMany<T> = T | T[] | null

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
  'id' | 'id_nomina' | 'nombre_completo' | 'puesto' | 'estatus_laboral' | 'correo_electronico'
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
  sesiones: UsuarioSessionItem[]
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

function toIsoOrNull(value: number | null) {
  return value ? new Date(value).toISOString() : null
}

function getSessionOrderValue(session: UsuarioSessionItem) {
  return Date.parse(
    session.refrescadaEn ?? session.actualizadaEn ?? session.creadaEn
  ) || 0
}

function getEstadoSesionUsuario({
  authVinculado,
  sesionesActivas,
  ultimoSignInAuthEn,
  authContextUpdatedAt,
}: {
  authVinculado: boolean
  sesionesActivas: UsuarioSessionItem[]
  ultimoSignInAuthEn: string | null
  authContextUpdatedAt: string | null
}): EstadoSesionUsuario {
  if (!authVinculado) {
    return 'SIN_ACCESO'
  }

  if (sesionesActivas.length > 0) {
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

export async function obtenerPanelUsuarios(
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
      .select('id, id_nomina, nombre_completo, puesto, estatus_laboral, correo_electronico')
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

  if (backendAdminConfigurado) {
    try {
      const service = createServiceClient()
      const authUsers = await listAllAuthUsers(service)
      for (const authUser of authUsers) {
        authUsersById.set(authUser.id, authUser)
      }
    } catch (error) {
      backendAdminListo = false
      mensajeBackendAdmin =
        error instanceof Error ? error.message : 'No fue posible consultar auth.users.'
    }
  } else {
    backendAdminListo = false
    mensajeBackendAdmin =
      'Falta configurar SUPABASE_SERVICE_ROLE_KEY para operar altas, resets y cambios administrativos.'
  }

  let sesionesOperativasDisponibles = true
  let mensajeSesiones: string | undefined
  const sessionsByUserId = new Map<string, UsuarioSessionItem[]>()

  const { data: sesionesData, error: sesionesError } = await supabase.rpc(
    'admin_list_auth_sessions'
  )

  if (sesionesError) {
    sesionesOperativasDisponibles = false
    mensajeSesiones = sesionesError.message
  } else {
    for (const session of (sesionesData ?? []) as AuthSessionQueryRow[]) {
      const current = sessionsByUserId.get(session.auth_user_id) ?? []
      current.push({
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
      })
      sessionsByUserId.set(session.auth_user_id, current)
    }

    for (const [authUserId, sessions] of sessionsByUserId.entries()) {
      sessionsByUserId.set(
        authUserId,
        sessions.sort((left, right) => getSessionOrderValue(right) - getSessionOrderValue(left))
      )
    }
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
    const sesiones = usuario.auth_user_id
      ? (sessionsByUserId.get(usuario.auth_user_id) ?? []).filter((session) => session.activa)
      : []
    const ultimoSignInAuthEn = authUser?.last_sign_in_at ?? null
    const resetAvailability = getResetAvailability({
      authVinculado: Boolean(usuario.auth_user_id),
      estadoCuenta: usuario.estado_cuenta,
      authEmail: authUser?.email ?? null,
    })

    return {
      id: usuario.id,
      empleadoId: usuario.empleado_id,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      puesto: (empleado?.puesto ?? 'DERMOCONSEJERO') as Puesto,
      username: usuario.username,
      correo: usuario.correo_electronico,
      correoAuth: authUser?.email ?? null,
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
        sesionesActivas: sesiones,
        ultimoSignInAuthEn,
        authContextUpdatedAt,
      }),
      sesionesActivas: sesiones.length,
      sesiones,
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
          item.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL'
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
      .filter((empleado) => !empleadosAsignados.has(empleado.id))
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