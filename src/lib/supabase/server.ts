import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
export type TypedSupabaseClient = SupabaseClient<any>
import { cookies } from 'next/headers'
import { requireRuntimeEnv } from '@/lib/runtime/env'
import { createTenantScopedFetch, readRequestAccountScope } from '@/lib/tenant/accountScope'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

export async function createClient(options?: { bypassTenantScope?: boolean }) {
  const cookieStore = await cookies()
  const accountScope = options?.bypassTenantScope ? null : await readRequestAccountScope()

  // The local Database type is incomplete, so we avoid over-constraining the client here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient<any>(
    requireRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireRuntimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServiceClient(): SupabaseClient<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseClient<any>(
    requireRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
