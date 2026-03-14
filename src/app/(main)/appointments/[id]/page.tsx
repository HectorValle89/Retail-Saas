import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { AppointmentDetail } from '@/features/appointments/components/AppointmentDetail'
import type { AppointmentWithRelations } from '@/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  return {
    title: 'Detalle de Cita | LexAgenda'
  }
}

export default async function AppointmentDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Obtener cita con relaciones
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select(`
      *,
      client:clients(*, profile:profiles(*)),
      lawyer:lawyers(*, profile:profiles(*)),
      appointment_type:appointment_types(*)
    `)
    .eq('id', id)
    .single()

  if (error || !appointment) {
    notFound()
  }

  // Determinar rol del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role === 'lawyer' ? 'lawyer' : 'client'

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/appointments">
          <Button variant="ghost" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a citas
          </Button>
        </Link>
      </div>

      <AppointmentDetail
        appointment={appointment as AppointmentWithRelations}
        userRole={userRole}
      />
    </div>
  )
}
