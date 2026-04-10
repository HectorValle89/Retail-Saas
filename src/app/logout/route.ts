export const runtime = 'edge';
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ACTIVE_ACCOUNT_COOKIE } from '@/lib/tenant/accountScope'
import { resolveLogoutRedirectUrl } from './redirect'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

function expireSessionCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith('sb-') || cookie.name === ACTIVE_ACCOUNT_COOKIE)
    .forEach((cookie) => {
      response.cookies.set(cookie.name, '', {
        expires: new Date(0),
        maxAge: 0,
        path: '/',
      })
    })
}

export async function GET(request: NextRequest) {
  const loginUrl = resolveLogoutRedirectUrl(request)
  const response = NextResponse.redirect(loginUrl)

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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  try {
    await supabase.auth.signOut()
  } finally {
    expireSessionCookies(request, response)
  }

  return response
}

