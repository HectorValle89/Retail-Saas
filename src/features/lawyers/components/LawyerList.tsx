'use client'

import { useLawyers } from '../hooks/useLawyers'
import { LawyerCard } from './LawyerCard'

interface LawyerListProps {
  specialty?: string
}

export function LawyerList({ specialty }: LawyerListProps) {
  const { lawyers, loading, error } = useLawyers({ specialty })

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="h-48 bg-gray-100 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-error-500">{error}</p>
      </div>
    )
  }

  if (lawyers.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">
          No hay abogados disponibles
        </h3>
        <p className="text-foreground-secondary">
          {specialty
            ? `No encontramos abogados con especialidad en ${specialty}`
            : 'No hay abogados registrados en el sistema'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      {lawyers.map(lawyer => (
        <LawyerCard key={lawyer.id} lawyer={lawyer} />
      ))}
    </div>
  )
}
