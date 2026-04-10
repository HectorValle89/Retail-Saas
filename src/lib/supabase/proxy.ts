import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isPrimerAccesoPendiente } from '@/lib/auth/firstAccess'
import { getAuthSessionContextStatus } from '@/lib/auth/sessionContext'
import { getSingleTenantAccountId, isSingleTenantBackendEnabled } from '@/lib/tenant/singleTenant'
import {
  ACTIVE_ACCOUNT_COOKIE,
  ACTIVE_ACCOUNT_HEADER,
  ACTIVE_ACCOUNT_SCOPE_HEADER,
  normalizeRequestedAccountId,
} from '@/lib/tenant/accountScope'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

type UsuarioSesionRow = {
  estado_cuenta: string | null
  cuenta_cliente_id: string | null
  empleado:
    | { puesto: string | null; metadata?: Record<string, unknown> | null }
    | Array<{ puesto: string | null; metadata?: Record<string, unknown> | null }>
    | null
}

const publicRoutes = ['/', '/offline', '/login', '/logout', '/forgot-password', '/check-email', '/update-password', '/activacion']

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

async function asegurarSesionActualizada(
  supabase: SupabaseClient,
  user: User
) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const initialStatus = getAuthSessionContextStatus({
    accessToken: session?.access_token,
    appMetadata: user.app_metadata,
  })

  if (!initialStatus.isStale) {
    return { user, session, invalidated: false }
  }

  if (initialStatus.exceededGraceWindow) {
    await supabase.auth.signOut()
    return { user: null, session: null, invalidated: true }
  }

  const refreshed = await supabase.auth.refreshSession()
  const refreshedSession = refreshed.data.session ?? null
  const refreshedUser = refreshedSession?.user ?? null

  const refreshedStatus = getAuthSessionContextStatus({
    accessToken: refreshedSession?.access_token,
    appMetadata: refreshedUser?.app_metadata,
  })

  if (refreshed.error || !refreshedSession || !refreshedUser || refreshedStatus.isStale) {
    await supabase.auth.signOut()
    return { user: null, session: null, invalidated: true }
  }

  return { user: refreshedUser, session: refreshedSession, invalidated: false }
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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isProtectedRoute = esRutaProtegida(pathname)
  const isAuthRoute = pathname === '/login'

  if (!user && isProtectedRoute) {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/login', request.url)),
      request.nextUrl.pathname
    )
  }

  if (!user) {
    return aplicarHeadersLocalNoStore(request, supabaseResponse, pathname)
  }

  const sessionState = await asegurarSesionActualizada(supabase, user)
  if (sessionState.invalidated) {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/login', request.url)),
      pathname
    )
  }

  const currentUser = sessionState.user
  if (!currentUser) {
    return aplicarHeadersLocalNoStore(
      request,
      NextResponse.redirect(new URL('/login', request.url)),
      pathname
    )
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select('estado_cuenta, cuenta_cliente_id, empleado:empleado_id(puesto, metadata)')
    .eq('auth_user_id', currentUser.id)
    .maybeSingle()

  const usuarioActual = (usuario ?? null) as UsuarioSesionRow | null
  const puesto = obtenerPuestoEmpleado(usuarioActual?.empleado ?? null)
  const metadataEmpleado = obtenerMetadataEmpleado(usuarioActual?.empleado ?? null)
  const primerAccesoPendiente = isPrimerAccesoPendiente(metadataEmpleado)
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

  supabaseResponse = rebuildResponse()

  const estadoCuenta = usuarioActual?.estado_cuenta ?? null

  if (estadoCuenta === 'PROVISIONAL' || estadoCuenta === 'PENDIENTE_VERIFICACION_EMAIL') {
    if (pathname !== '/activacion' && pathname !== '/check-email' && pathname !== '/update-password') {
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
    (isAuthRoute || pathname === '/activacion' || pathname === '/check-email' || pathname === '/primer-acceso')
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
