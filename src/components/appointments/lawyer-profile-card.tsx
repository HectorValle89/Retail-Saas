import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

export interface Lawyer {
  id: string
  name: string
  email: string
  phone: string
  specialty: string
  experience: number
  rating: number
  availability: 'available' | 'busy' | 'unavailable'
  avatar?: string
  bio?: string
}

interface LawyerProfileCardProps {
  lawyer: Lawyer
  onBook?: (id: string) => void
  onViewProfile?: (id: string) => void
}

const availabilityStyles = {
  available: { label: 'Disponible', variant: 'confirmed' as const },
  busy: { label: 'Ocupado', variant: 'pending' as const },
  unavailable: { label: 'No disponible', variant: 'cancelled' as const },
}

export function LawyerProfileCard({ lawyer, onBook, onViewProfile }: LawyerProfileCardProps) {
  const availStatus = availabilityStyles[lawyer.availability]
  
  return (
    <Card className="hover:shadow-card-hover transition-shadow">
      <div className="flex gap-4">
        {/* Avatar */}
        <div className="shrink-0">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center">
            {lawyer.avatar ? (
              <img src={lawyer.avatar} alt={lawyer.name} className="w-full h-full rounded-2xl object-cover" />
            ) : (
              <span className="text-xl font-semibold text-primary-600">
                {lawyer.name.split(' ').map(n => n[0]).join('')}
              </span>
            )}
          </div>
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-foreground">{lawyer.name}</h3>
              <p className="text-sm text-foreground-secondary">{lawyer.specialty}</p>
            </div>
            <Badge variant={availStatus.variant}>{availStatus.label}</Badge>
          </div>
          
          <div className="mt-3 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <StarIcon className="w-4 h-4 text-secondary-500" />
              <span className="font-medium text-foreground">{lawyer.rating}</span>
            </div>
            <span className="text-foreground-muted">{lawyer.experience} años exp.</span>
          </div>
          
          {lawyer.bio && (
            <p className="mt-2 text-sm text-foreground-secondary line-clamp-2">{lawyer.bio}</p>
          )}
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-border flex gap-3">
        <Button 
          size="sm" 
          onClick={() => onBook?.(lawyer.id)}
          disabled={lawyer.availability === 'unavailable'}
        >
          Agendar Cita
        </Button>
        <Button size="sm" variant="outline" onClick={() => onViewProfile?.(lawyer.id)}>
          Ver Perfil
        </Button>
      </div>
    </Card>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}
