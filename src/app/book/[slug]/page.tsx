import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PublicBookingPage } from './PublicBookingPage'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: lawyer } = await supabase
    .from('lawyers')
    .select('profile:profiles(full_name), specialty')
    .eq('id', slug)
    .single()

  if (!lawyer) {
    return { title: 'Abogado no encontrado | LexAgenda' }
  }

  const profile = Array.isArray(lawyer.profile) ? lawyer.profile[0] : lawyer.profile

  return {
    title: `Agendar cita con ${profile?.full_name || 'Abogado'} | LexAgenda`,
    description: `Agenda tu consulta legal con ${profile?.full_name}. Especialidad: ${lawyer.specialty}`
  }
}

export default async function BookLawyerPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // Try to find lawyer by ID or slug
  const { data: lawyer } = await supabase
    .from('lawyers')
    .select(`
      *,
      profile:profiles(id, full_name, email, avatar_url),
      availability(day_of_week, start_time, end_time, is_available)
    `)
    .eq('id', slug)
    .eq('is_active', true)
    .single()

  if (!lawyer) {
    notFound()
  }

  // Get appointment types
  const { data: appointmentTypes } = await supabase
    .from('appointment_types')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true })

  const profile = Array.isArray(lawyer.profile) ? lawyer.profile[0] : lawyer.profile

  return (
    <PublicBookingPage
      lawyer={{
        id: lawyer.id,
        name: profile?.full_name || 'Abogado',
        email: profile?.email || '',
        avatar: profile?.avatar_url,
        specialty: lawyer.specialty,
        bio: lawyer.bio,
        experience_years: lawyer.experience_years,
        hourly_rate: lawyer.hourly_rate,
        rating: lawyer.rating,
        availability: lawyer.availability || []
      }}
      appointmentTypes={appointmentTypes || []}
    />
  )
}
