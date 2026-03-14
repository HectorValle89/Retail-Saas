import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PricingManager } from './PricingManager'

export const metadata = {
  title: 'Gestión de Precios | LexAgenda Admin'
}

export default async function AdminPricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verificar que sea admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  // Obtener tipos de cita existentes
  const { data: appointmentTypes } = await supabase
    .from('appointment_types')
    .select('*')
    .order('name')

  // Obtener abogados con sus tarifas
  const { data: lawyers } = await supabase
    .from('lawyers')
    .select('*, profile:profiles(full_name, email)')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Gestión de Precios</h1>
        <p className="text-foreground-secondary mt-1">
          Configura tipos de servicio y tarifas por abogado
        </p>
      </div>

      <PricingManager
        initialAppointmentTypes={appointmentTypes || []}
        initialLawyers={lawyers || []}
      />
    </div>
  )
}
