import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthSessionContextStatus } from '@/lib/auth/sessionContext'
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
  empleado: { puesto: string | null } | Array<{ puesto: string | null }> | null
}

const publicRoutes = ['/', '/login', '/forgot-password', '/check-email', '/update-password', '/activacion']

function esRutaProtegida(pathname: string) {
  return !publicRoutes.includes(pathname) && !pathname.startsWith('/_next')
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
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!user) {
    return supabaseResponse
  }

  const sessionState = await asegurarSesionActualizada(supabase, user)
  if (sessionState.invalidated) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const currentUser = sessionState.user
  if (!currentUser) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select('estado_cuenta, cuenta_cliente_id, empleado:empleado_id(puesto)')
    .eq('auth_user_id', currentUser.id)
    .maybeSingle()

  const usuarioActual = (usuario ?? null) as UsuarioSesionRow | null
  const puesto = obtenerPuestoEmpleado(usuarioActual?.empleado ?? null)
  const requestedAccountId = normalizeRequestedAccountId(request.cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value)
  const effectiveAccountId =
    puesto === 'ADMINISTRADOR'
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

  if (estadoCuenta === 'ACTIVA' && (isAuthRoute || pathname === '/activacion' || pathname === '/check-email')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if ((estadoCuenta === 'SUSPENDIDA' || estadoCuenta === 'BAJA') && pathname !== '/login') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}
