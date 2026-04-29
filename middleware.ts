import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (error) {
    console.error('[middleware] updateSession failed', error)
    throw error
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
