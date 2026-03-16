import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createTenantScopedFetch, readRequestAccountScope } from '@/lib/tenant/accountScope'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

export async function createClient(options?: { bypassTenantScope?: boolean }) {
  const cookieStore = await cookies()
  const accountScope = options?.bypassTenantScope ? null : await readRequestAccountScope()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: createTenantScopedFetch(accountScope?.accountId ?? null),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore en Server Components
          }
        },
      },
    }
  )
}

// Service role client for admin operations (bypasses RLS)
// Use this only for server-side operations that need elevated privileges
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}