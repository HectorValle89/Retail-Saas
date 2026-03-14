'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useSpecialties } from '../hooks/useLawyers'
import { Select } from '@/components/ui/select'

export function LawyerFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSpecialty = searchParams.get('specialty') || ''
  const { specialties, loading } = useSpecialties()

  const handleSpecialtyChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('specialty', value)
    } else {
      params.delete('specialty')
    }
    router.push(`/lawyers?${params.toString()}`)
  }

  const specialtyOptions = [
    { value: '', label: 'Todas las especialidades' },
    ...specialties.map(s => ({ value: s, label: s }))
  ]

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="w-64">
        <Select
          label="Filtrar por especialidad"
          value={currentSpecialty}
          onChange={(e) => handleSpecialtyChange(e.target.value)}
          options={loading ? [{ value: '', label: 'Cargando...' }] : specialtyOptions}
        />
      </div>

      {currentSpecialty && (
        <button
          onClick={() => handleSpecialtyChange('')}
          className="text-sm text-accent-500 hover:text-accent-600 underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
