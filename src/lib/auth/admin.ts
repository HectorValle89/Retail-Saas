import 'server-only'

import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

export const ERROR_BACKEND_ADMIN =
  'El backend administrativo de autenticacion no esta configurado. Define SUPABASE_SERVICE_ROLE_KEY para operar usuarios corporativos.'

export function obtenerClienteAdmin() {
  try {
    return { service: createServiceClient(), error: null }
  } catch {
    return { service: null, error: ERROR_BACKEND_ADMIN }
  }
}

export async function obtenerUrlBaseAplicacion() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, '')
  }

  const headerStore = await headers()
  const origin = headerStore.get('origin')?.trim()

  if (origin) {
    return origin.replace(/\/$/, '')
  }

  const forwardedHost =
    headerStore.get('x-forwarded-host')?.trim() ?? headerStore.get('host')?.trim()

  if (forwardedHost) {
    const forwardedProto = headerStore.get('x-forwarded-proto')?.trim() ?? 'https'
    return `${forwardedProto}://${forwardedHost}`
  }

  return 'http://localhost:3000'
}