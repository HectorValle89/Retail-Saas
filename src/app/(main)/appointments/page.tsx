import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { AppointmentsListServer } from './AppointmentsListServer'

export const metadata = {
  title: 'Mis Citas | LexAgenda'
}

export default async function AppointmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Determinar rol del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = (profile?.role || 'client') as 'client' | 'lawyer' | 'admin'

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mis Citas</h1>
          <p className="text-foreground-secondary mt-1">
            {userRole === 'lawyer'
              ? 'Gestiona las citas de tus clientes'
              : userRole === 'admin'
              ? 'Vista general de todas las citas'
              : 'Administra tus citas programadas'}
          </p>
        </div>
        {userRole === 'client' && (
          <Link href="/appointments/new">
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nueva Cita
            </Button>
          </Link>
        )}
      </div>

      <Suspense fallback={
        <div className="animate-pulse">
          <div className="h-16 bg-gray-100 rounded-t-2xl mb-px" />
          <div className="space-y-px">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="h-24 bg-gray-100" />
            ))}
          </div>
        </div>
      }>
        <AppointmentsListServer userId={user.id} userRole={userRole} />
      </Suspense>
    </div>
  )
}
