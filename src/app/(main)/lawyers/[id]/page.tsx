import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LawyerQRSection } from '@/features/qr/components/LawyerQRSection'

interface Props {
  params: Promise<{ id: string }>
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default async function LawyerDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  const { data: lawyer, error } = await supabase
    .from('lawyers')
    .select(`
      *,
      profile:profiles(id, full_name, email, avatar_url),
      availability(*)
    `)
    .eq('id', id)
    .single()

  if (error || !lawyer) {
    notFound()
  }

  // Check if current user is this lawyer or an admin
  const isOwner = user?.id === lawyer.user_id
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.role === 'admin'
  }
  const showQRSection = isOwner || isAdmin

  const initials = lawyer.profile?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'

  return (
    <div className="p-8 max-w-4xl mx-auto">
        <Link
          href="/lawyers"
          className="inline-flex items-center gap-2 text-foreground-secondary hover:text-foreground mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver a abogados
        </Link>

        <Card className="p-8">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Avatar y datos básicos */}
            <div className="flex-shrink-0">
              {lawyer.profile?.avatar_url ? (
                <img
                  src={lawyer.profile.avatar_url}
                  alt={lawyer.profile.full_name || 'Abogado'}
                  className="w-32 h-32 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-32 h-32 rounded-2xl bg-gradient-primary flex items-center justify-center text-white font-bold text-3xl">
                  {initials}
                </div>
              )}
            </div>

            {/* Información principal */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    {lawyer.profile?.full_name || 'Sin nombre'}
                  </h1>
                  <p className="text-lg text-accent-500 font-medium">
                    {lawyer.specialty}
                  </p>
                </div>
                <Badge variant={lawyer.is_active ? 'confirmed' : 'cancelled'}>
                  {lawyer.is_active ? 'Disponible' : 'No disponible'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-6 mb-6">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-secondary-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-semibold">{lawyer.rating.toFixed(1)}</span>
                  <span className="text-foreground-secondary">calificación</span>
                </div>

                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="font-semibold">{lawyer.experience_years}</span>
                  <span className="text-foreground-secondary">años de experiencia</span>
                </div>

                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">${lawyer.hourly_rate}</span>
                  <span className="text-foreground-secondary">por hora</span>
                </div>
              </div>

              {lawyer.bio && (
                <div className="mb-6">
                  <h3 className="font-semibold text-foreground mb-2">Acerca de</h3>
                  <p className="text-foreground-secondary leading-relaxed">{lawyer.bio}</p>
                </div>
              )}

              <Link href={`/appointments/new?lawyer=${lawyer.id}`}>
                <Button
                  size="lg"
                  disabled={!lawyer.is_active}
                  className="w-full md:w-auto"
                >
                  Agendar Cita
                </Button>
              </Link>
            </div>
          </div>

          {/* Disponibilidad */}
          {lawyer.availability && lawyer.availability.length > 0 && (
            <div className="mt-8 pt-8 border-t border-border">
              <h3 className="font-semibold text-foreground mb-4">Horarios de Atención</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {lawyer.availability
                  .filter((a: { is_available: boolean }) => a.is_available)
                  .sort((a: { day_of_week: number }, b: { day_of_week: number }) => a.day_of_week - b.day_of_week)
                  .map((slot: { id: string; day_of_week: number; start_time: string; end_time: string }) => (
                    <div
                      key={slot.id}
                      className="bg-gray-50 rounded-lg px-4 py-3"
                    >
                      <p className="font-medium text-foreground">{DAYS[slot.day_of_week]}</p>
                      <p className="text-sm text-foreground-secondary">
                        {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card>

        {/* QR Section - Only visible to lawyer owner or admin */}
        {showQRSection && (
          <div className="mt-6">
            <LawyerQRSection
              lawyerId={lawyer.id}
              lawyerSlug={lawyer.id}
              lawyerName={lawyer.profile?.full_name || 'Abogado'}
            />
          </div>
        )}
      </div>
  )
}
