import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, UsuarioSistema } from '@/types/database'

type MaybeMany<T> = T | T[] | null

interface EmpleadoRelacion {
  nombre_completo: string
  puesto: string
}

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre' | 'identificador'>

interface UsuarioQueryRow
  extends Pick<
    UsuarioSistema,
    | 'id'
    | 'auth_user_id'
    | 'username'
    | 'estado_cuenta'
    | 'correo_electronico'
    | 'correo_verificado'
    | 'updated_at'
  > {
  empleado: MaybeMany<EmpleadoRelacion>
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
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

export interface UsuarioListadoItem {
  id: string
  empleado: string
  puesto: string
  username: string | null
  correo: string | null
  estadoCuenta: string
  authVinculado: boolean
  cuentaCliente: string | null
  correoVerificado: boolean
  actualizadoEn: string
}

export interface UsuariosPanelData {
  resumen: UsuariosResumen
  provisionamiento: ProvisionamientoAuth
  usuarios: UsuarioListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export async function obtenerPanelUsuarios(
  supabase: SupabaseClient,
  {
    backendAdminConfigurado,
  }: {
    backendAdminConfigurado: boolean
  }
): Promise<UsuariosPanelData> {
  const { data, error } = await supabase
    .from('usuario')
    .select(`
      id,
      auth_user_id,
      username,
      estado_cuenta,
      correo_electronico,
      correo_verificado,
      updated_at,
      empleado:empleado_id(nombre_completo, puesto),
      cuenta_cliente:cuenta_cliente_id(nombre, identificador)
    `)
    .order('updated_at', { ascending: false })
    .limit(120)

  if (error) {
    return {
      resumen: {
        total: 0,
        activas: 0,
        sinAuth: 0,
        pendientesActivacion: 0,
      },
      provisionamiento: {
        backendAdminConfigurado,
        usuariosConAuth: 0,
        usuariosSinAuth: 0,
        listosParaOperar: 0,
        bloqueados: 0,
      },
      usuarios: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        error.message ?? 'La tabla `usuario` aun no esta disponible en Supabase.',
    }
  }

  const usuarios = ((data ?? []) as unknown as UsuarioQueryRow[]).map((usuario) => {
    const empleado = obtenerPrimero(usuario.empleado)
    const cuentaCliente = obtenerPrimero(usuario.cuenta_cliente)

    return {
      id: usuario.id,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      puesto: empleado?.puesto ?? 'Sin puesto',
      username: usuario.username,
      correo: usuario.correo_electronico,
      estadoCuenta: usuario.estado_cuenta,
      authVinculado: Boolean(usuario.auth_user_id),
      cuentaCliente: cuentaCliente?.nombre ?? null,
      correoVerificado: usuario.correo_verificado,
      actualizadoEn: usuario.updated_at,
    }
  })

  const usuariosConAuth = usuarios.filter((item) => item.authVinculado).length
  const usuariosSinAuth = usuarios.length - usuariosConAuth

  return {
    resumen: {
      total: usuarios.length,
      activas: usuarios.filter((item) => item.estadoCuenta === 'ACTIVA').length,
      sinAuth: usuariosSinAuth,
      pendientesActivacion: usuarios.filter((item) =>
        item.estadoCuenta === 'PROVISIONAL' ||
        item.estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL'
      ).length,
    },
    provisionamiento: {
      backendAdminConfigurado,
      usuariosConAuth,
      usuariosSinAuth,
      listosParaOperar: usuarios.filter((item) =>
        item.authVinculado && item.estadoCuenta === 'ACTIVA'
      ).length,
      bloqueados: usuarios.filter((item) =>
        item.estadoCuenta === 'SUSPENDIDA' || item.estadoCuenta === 'BAJA'
      ).length,
    },
    usuarios,
    infraestructuraLista: true,
  }
}
