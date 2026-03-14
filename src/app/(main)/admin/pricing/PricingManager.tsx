'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { AppointmentType, Lawyer, Profile } from '@/types/database'

interface PricingManagerProps {
  initialAppointmentTypes: AppointmentType[]
  initialLawyers: (Lawyer & { profile: Profile })[]
}

export function PricingManager({ initialAppointmentTypes, initialLawyers }: PricingManagerProps) {
  const [appointmentTypes, setAppointmentTypes] = useState(initialAppointmentTypes)
  const [lawyers, setLawyers] = useState(initialLawyers)
  const [showAddType, setShowAddType] = useState(false)
  const [editingType, setEditingType] = useState<AppointmentType | null>(null)
  const [editingLawyer, setEditingLawyer] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form states
  const [typeName, setTypeName] = useState('')
  const [typeDescription, setTypeDescription] = useState('')
  const [typeDuration, setTypeDuration] = useState(60)
  const [typePrice, setTypePrice] = useState(0)

  const handleSaveType = async () => {
    if (!typeName.trim()) return
    setSaving(true)

    const supabase = createClient()
    const typeData = {
      name: typeName,
      description: typeDescription || null,
      duration_minutes: typeDuration,
      price: typePrice,
      is_active: true,
    }

    if (editingType) {
      const { error } = await supabase
        .from('appointment_types')
        .update(typeData)
        .eq('id', editingType.id)

      if (!error) {
        setAppointmentTypes(types =>
          types.map(t => t.id === editingType.id ? { ...t, ...typeData } : t)
        )
      }
    } else {
      const { data, error } = await supabase
        .from('appointment_types')
        .insert(typeData)
        .select()
        .single()

      if (!error && data) {
        setAppointmentTypes([...appointmentTypes, data])
      }
    }

    resetForm()
    setSaving(false)
  }

  const handleDeleteType = async (id: string) => {
    if (!confirm('¿Eliminar este tipo de servicio?')) return

    const supabase = createClient()
    const { error } = await supabase
      .from('appointment_types')
      .delete()
      .eq('id', id)

    if (!error) {
      setAppointmentTypes(types => types.filter(t => t.id !== id))
    }
  }

  const handleUpdateLawyerRate = async (lawyerId: string, hourlyRate: number) => {
    setSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('lawyers')
      .update({ hourly_rate: hourlyRate })
      .eq('id', lawyerId)

    if (!error) {
      setLawyers(lawyers =>
        lawyers.map(l => l.id === lawyerId ? { ...l, hourly_rate: hourlyRate } : l)
      )
    }

    setSaving(false)
    setEditingLawyer(null)
  }

  const resetForm = () => {
    setTypeName('')
    setTypeDescription('')
    setTypeDuration(60)
    setTypePrice(0)
    setEditingType(null)
    setShowAddType(false)
  }

  const startEditType = (type: AppointmentType) => {
    setTypeName(type.name)
    setTypeDescription(type.description || '')
    setTypeDuration(type.duration_minutes)
    setTypePrice(type.price)
    setEditingType(type)
    setShowAddType(true)
  }

  return (
    <div className="space-y-8">
      {/* Tipos de Servicio */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Tipos de Servicio</h2>
          <Button onClick={() => setShowAddType(true)}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Agregar Servicio
          </Button>
        </div>

        {showAddType && (
          <Card className="p-6 mb-4 border-2 border-accent-200 animate-slide-up">
            <h3 className="font-semibold text-foreground mb-4">
              {editingType ? 'Editar Servicio' : 'Nuevo Servicio'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">
                  Nombre del Servicio *
                </label>
                <input
                  type="text"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  placeholder="Ej: Consulta Inicial"
                  className="w-full px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">
                  Duración (minutos)
                </label>
                <input
                  type="number"
                  value={typeDuration}
                  onChange={(e) => setTypeDuration(Number(e.target.value))}
                  min={15}
                  step={15}
                  className="w-full px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">
                  Precio Base ($)
                </label>
                <input
                  type="number"
                  value={typePrice}
                  onChange={(e) => setTypePrice(Number(e.target.value))}
                  min={0}
                  className="w-full px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={typeDescription}
                  onChange={(e) => setTypeDescription(e.target.value)}
                  placeholder="Descripción breve..."
                  className="w-full px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button onClick={handleSaveType} disabled={saving || !typeName.trim()}>
                {saving ? 'Guardando...' : editingType ? 'Actualizar' : 'Crear Servicio'}
              </Button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {appointmentTypes.map(type => (
            <Card key={type.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{type.name}</h3>
                  {type.description && (
                    <p className="text-sm text-foreground-secondary mt-1">{type.description}</p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  type.is_active ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {type.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs text-foreground-secondary">Duración</p>
                  <p className="font-semibold text-foreground">{type.duration_minutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-secondary">Precio</p>
                  <p className="font-semibold text-secondary-600">${type.price}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button variant="ghost" size="sm" onClick={() => startEditType(type)}>
                  Editar
                </Button>
                <Button variant="ghost" size="sm" className="text-error-600 hover:text-error-700" onClick={() => handleDeleteType(type.id)}>
                  Eliminar
                </Button>
              </div>
            </Card>
          ))}

          {appointmentTypes.length === 0 && (
            <Card className="col-span-full p-8 text-center">
              <p className="text-foreground-secondary">No hay servicios configurados</p>
              <Button onClick={() => setShowAddType(true)} className="mt-4">
                Crear Primer Servicio
              </Button>
            </Card>
          )}
        </div>
      </section>

      {/* Tarifas por Abogado */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Tarifas por Abogado</h2>

        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Abogado</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Especialidad</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Tarifa por Hora</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Estado</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-foreground-secondary">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lawyers.map(lawyer => (
                <tr key={lawyer.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary-600">
                          {lawyer.profile?.full_name?.slice(0, 2).toUpperCase() || '??'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{lawyer.profile?.full_name}</p>
                        <p className="text-sm text-foreground-secondary">{lawyer.profile?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-foreground-secondary">{lawyer.specialty}</td>
                  <td className="px-6 py-4">
                    {editingLawyer === lawyer.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-foreground-secondary">$</span>
                        <input
                          type="number"
                          defaultValue={lawyer.hourly_rate}
                          min={0}
                          className="w-24 px-3 py-1 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateLawyerRate(lawyer.id, Number((e.target as HTMLInputElement).value))
                            }
                          }}
                        />
                        <span className="text-foreground-secondary">/hora</span>
                      </div>
                    ) : (
                      <span className="font-semibold text-secondary-600">${lawyer.hourly_rate}/hora</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      lawyer.is_active ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {lawyer.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {editingLawyer === lawyer.id ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditingLawyer(null)}>
                        Cancelar
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setEditingLawyer(lawyer.id)}>
                        Editar Tarifa
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {lawyers.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-foreground-secondary">No hay abogados registrados</p>
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}
