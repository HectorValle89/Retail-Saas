import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isPrimerAccesoPendiente } from '@/lib/auth/firstAccess'
import { getAuthSessionContextStatusFromClaims } from '@/lib/auth/sessionContext'
import { requireRuntimeEnv } from '@/lib/runtime/env'
import { getSingleTenantAccountId, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant'
import {
  ACTIVE_ACCOUNT_COOKIE,
  ACTIVE_ACCOUNT_HEADER,
  ACTIVE_ACCOUNT_SCOPE_HEADER,
  normalizeRequestedAccountId,
} from '@/lib/tenant/accountScope'

export const ACTOR_CONTEXT_HEADER = 'x-retail-actor-context'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

type UsuarioSesionRow = {
  id: string
  empleado_id: string
  username: string | null
  correo_electronico: string | null
  correo_verificado: boolean | null
  estado_cuenta: string | null
  cuenta_cliente_id: string | null
  empleado:
    | { nombre_completo: string | null; puesto: string | null; metadata?: Record<string, unknown> | null }
    | Array<{ nombre_completo: string | null; puesto: string | null; metadata?: Record<string, unknown> | null }>
    | null
}

const publicRoutes = ['/', '/offline', '/login', '/logout', '/forgot-password', '/check-email', '/update-password', '/activacion', '/enlace-caducado', '/api/auth/confirm']

function esRutaProtegida(pathname: string) {
  return !publicRoutes.includes(pathname) && !pathname.startsWith('/_next')
}

function esOrigenDesarrollo(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase().split(':')[0] ?? ''

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
}

function admiteClearSiteData(request: NextRequest) {
  const protocol = request.nextUrl.protocol
  const host = request.headers.get('host')?.toLowerCase().split(':')[0] ?? ''

  return (
    protocol === 'https:' ||
    host === 'localhost' ||
    host === '127.0.0.1'
  )
}

function aplicarHeadersLocalNoStore(
  request: NextRequest,
  response: NextResponse,
  pathname: string
) {
  if (!esOrigenDesarrollo(request)) {
    return response
  }

  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')

  if ((pathname === '/login' || pathname === '/logout') && admiteClearSiteData(request)) {
    response.headers.set('Clear-Site-Data', '"cache", "storage"')
  }

  return response
}

function obtenerPuestoEmpleado(value: UsuarioSesionRow['empleado']) {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value[0]?.puesto ?? null
  }

  return value.puesto ?? null
}

function obtenerMetadataEmpleado(value: UsuarioSesionRow['empleado']) {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value[0]?.metadata ?? null
  }

  return value.metadata ?? null
}

function obtenerNombreEmpleado(value: UsuarioSesionRow['empleado']) {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value[0]?.nombre_completo ?? null
  }

  return value.nombre_completo ?? null
}

function serializeActorContextHeader(input: {
  authUserId: string
  usuarioId: string
  empleadoId: string
  cuentaClienteId: string | null
  username: string | null
  correoElectronico: string | null
  correoVerificado: boolean
  estadoCuenta: string | null
  nombreCompleto: string | null
  puesto: string | null
  primerAccesoPendiente: boolean
}) {
  return encodeURIComponent(JSON.stringify(input))
}

type AuthClaims = {
  sub?: string
  app_metadata?: Record<string, unknown> | null
}

async function asegurarSesionActualizada(
  supabase: SupabaseClient,
  claims: AuthClaims | null
) {
  const authUserId = typeof claims?.sub === 'string' ? claims.sub : null
  const initialStatus = getAuthSessionContextStatusFromClaims({
    claims,
  })

  if (!initialStatus.isStale) {
    return { authUserId, invalidated: false }
  }

  if (initialStatus.exceededGraceWindow) {
    await supabase.auth.signOut()
    return { authUserId: null, invalidated: true }
  }

  const refreshed = await supabase.auth.refreshSession()
  const refreshedSession = refreshed.data.session ?? null
  const refreshedUser = refreshedSession?.user ?? null

  if (refreshed.error || !refreshedSession || !refreshedUser) {
    await supabase.auth.signOut()
    return { authUserId: null, invalidated: true }
  }

  const refreshedStatus = getAuthSessionContextStatusFromClaims({
    claims: {
      sub: refreshedUser.id,
      app_metadata: refreshedUser.app_metadata,
    },
  })

  if (refreshedStatus.isStale) {
    await supabase.auth.signOut()
    return { authUserId: null, invalidated: true }
  }

  return { authUserId: refreshedUser.id, invalidated: false }
}

export async function updateSession(request: NextRequest) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''

  // Next.js puede dejar el body multipart en estado no parseable si el proxy
  // intercepta uploads. Para requests con archivos dejamos pasar la solicitud
  // intacta y delegamos autenticacion/autorizacion a la ruta destino.
  if (contentType.startsWith('multipart/form-data')) {
    return aplicarHeadersLocalNoStore(request, NextResponse.next(), request.nextUrl.pathname)
  }

  const requestHeaders = new Headers(request.headers)
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const rebuildResponse = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    supabaseResponse = response
    return response
  }

  const supabase = createServerClient(
    requireRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireRuntimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          rebuildResponse()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const isProtectedRoute = esRutaProtegida(pathname)
  const isAuthRoute = pathname === '/login'

  if (!isProtectedRoute || isAuthRoute) {
    return aplicarHeadersLocalNoStore(request, supabaseResponse, pathname)
  }

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims()

  const authClaims = ((claimsData?.claims ?? null) as AuthClaims | null)
  const authUserId = typeof authClaims?.sub === 'string' ? authClaims.sub : null

  if (claimsError || !authUserId) {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/login', request.url)),
      request.nextUrl.pathname
    )
  }

  const sessionState = await asegurarSesionActualizada(supabase, authClaims)
  if (sessionState.invalidated) {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/login', request.url)),
      pathname
    )
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select(
      'id, empleado_id, username, correo_electronico, correo_verificado, estado_cuenta, cuenta_cliente_id, empleado:empleado_id(nombre_completo, puesto, metadata)'
    )
    .eq('auth_user_id', sessionState.authUserId ?? authUserId)
    .maybeSingle()

  const usuarioActual = (usuario ?? null) as UsuarioSesionRow | null
  const puesto = obtenerPuestoEmpleado(usuarioActual?.empleado ?? null)
  const metadataEmpleado = obtenerMetadataEmpleado(usuarioActual?.empleado ?? null)
  const estadoCuenta = usuarioActual?.estado_cuenta ?? null
  const primerAccesoPendiente =
    estadoCuenta === 'PENDIENTE_PRIMER_LOGIN' || isPrimerAccesoPendiente(metadataEmpleado)
  const nombreCompleto = obtenerNombreEmpleado(usuarioActual?.empleado ?? null)
  const requestedAccountId = normalizeRequestedAccountId(request.cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value)
  const effectiveAccountId =
    isSingleTenantBackendEnabled()
      ? getSingleTenantAccountId()
      : puesto === 'ADMINISTRADOR'
      ? requestedAccountId
      : normalizeRequestedAccountId(usuarioActual?.cuenta_cliente_id)

  if (effectiveAccountId) {
    requestHeaders.set(ACTIVE_ACCOUNT_HEADER, effectiveAccountId)
    requestHeaders.set(ACTIVE_ACCOUNT_SCOPE_HEADER, 'scoped')
  } else {
    requestHeaders.delete(ACTIVE_ACCOUNT_HEADER)
    requestHeaders.set(ACTIVE_ACCOUNT_SCOPE_HEADER, 'global')
  }

  if (usuarioActual?.id && usuarioActual.empleado_id) {
    requestHeaders.set(
      ACTOR_CONTEXT_HEADER,
      serializeActorContextHeader({
        authUserId: sessionState.authUserId ?? authUserId,
        usuarioId: usuarioActual.id,
        empleadoId: usuarioActual.empleado_id,
        cuentaClienteId: effectiveAccountId ?? usuarioActual.cuenta_cliente_id ?? null,
        username: usuarioActual.username,
        correoElectronico: usuarioActual.correo_electronico,
        correoVerificado: Boolean(usuarioActual.correo_verificado),
        estadoCuenta: usuarioActual.estado_cuenta,
        nombreCompleto,
        puesto,
        primerAccesoPendiente,
      })
    )
  } else {
    requestHeaders.delete(ACTOR_CONTEXT_HEADER)
  }

  supabaseResponse = rebuildResponse()

  if (estadoCuenta === 'PENDIENTE_PRIMER_LOGIN' && pathname !== '/primer-acceso') {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/primer-acceso', request.url)),
      pathname
    )
  }

  if (estadoCuenta === 'PROVISIONAL' || estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL') {
    if (
      pathname !== '/activacion' &&
      pathname !== '/check-email' &&
      pathname !== '/update-password' &&
      pathname !== '/enlace-caducado'
    ) {
      return NextResponse.redirect(new URL('/activacion', request.url))
    }
  }

  if (estadoCuenta === 'ACTIVA' && primerAccesoPendiente && pathname !== '/primer-acceso') {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/primer-acceso', request.url)),
      pathname
    )
  }

  if (
    estadoCuenta === 'ACTIVA' &&
    !primerAccesoPendiente &&
      (isAuthRoute || pathname === '/activacion' || pathname === '/check-email' || pathname === '/primer-acceso' || pathname === '/enlace-caducado')
  ) {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/dashboard', request.url)),
      pathname
    )
  }

  if ((estadoCuenta === 'SUSPENDIDA' || estadoCuenta === 'BAJA') && pathname !== '/login') {
    await supabase.auth.signOut()
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/login', request.url)),
      pathname
    )
  }

  return aplicarHeadersLocalNoStore(request, supabaseResponse, pathname)
}
