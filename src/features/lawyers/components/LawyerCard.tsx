'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { LawyerWithProfile } from '@/types/database'

interface LawyerCardProps {
  lawyer: LawyerWithProfile
}

export function LawyerCard({ lawyer }: LawyerCardProps) {
  const router = useRouter()

  const initials = lawyer.profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'

  return (
    <Card className="p-6 hover:shadow-card-hover transition-shadow">
      <div className="flex items-start gap-4">
        {lawyer.profile?.avatar_url ? (
          <img
            src={lawyer.profile.avatar_url}
            alt={lawyer.profile.full_name || 'Abogado'}
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold text-lg">
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-foreground truncate">
              {lawyer.profile?.full_name || 'Sin nombre'}
            </h3>
            <Badge variant={lawyer.is_active ? 'confirmed' : 'cancelled'}>
              {lawyer.is_active ? 'Disponible' : 'No disponible'}
            </Badge>
          </div>

          <p className="text-sm text-accent-500 font-medium mb-2">
            {lawyer.specialty}
          </p>

          <div className="flex items-center gap-4 text-sm text-foreground-secondary mb-3">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 text-secondary-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {lawyer.rating.toFixed(1)}
            </span>
            <span>{lawyer.experience_years} años exp.</span>
            <span className="text-secondary-600 font-medium">
              ${lawyer.hourly_rate}/hr
            </span>
          </div>

          {lawyer.bio && (
            <p className="text-sm text-foreground-muted line-clamp-2 mb-4">
              {lawyer.bio}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => router.push(`/appointments/new?lawyer=${lawyer.id}`)}
              disabled={!lawyer.is_active}
            >
              Agendar Cita
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/lawyers/${lawyer.id}`)}
            >
              Ver Perfil
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
