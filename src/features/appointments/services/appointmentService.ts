import { createClient } from '@/lib/supabase/client'
import type { AppointmentWithRelations } from '@/types/database'

export const appointmentService = {
  async getByClient(clientId: string): Promise<AppointmentWithRelations[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        client:clients(*, profile:profiles(*)),
        lawyer:lawyers(*, profile:profiles(*)),
        appointment_type:appointment_types(*)
      `)
      .eq('client_id', clientId)
      .order('scheduled_at', { ascending: false })

    if (error) throw error
    return data as AppointmentWithRelations[]
  },

  async getByLawyer(lawyerId: string): Promise<AppointmentWithRelations[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        client:clients(*, profile:profiles(*)),
        lawyer:lawyers(*, profile:profiles(*)),
        appointment_type:appointment_types(*)
      `)
      .eq('lawyer_id', lawyerId)
      .order('scheduled_at', { ascending: false })

    if (error) throw error
    return data as AppointmentWithRelations[]
  },

  async getById(id: string): Promise<AppointmentWithRelations | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        client:clients(*, profile:profiles(*)),
        lawyer:lawyers(*, profile:profiles(*)),
        appointment_type:appointment_types(*)
      `)
      .eq('id', id)
      .single()

    if (error) return null
    return data as AppointmentWithRelations
  },

  async getAppointmentTypes() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('appointment_types')
      .select('*')
      .eq('is_active', true)
      .order('price')

    if (error) throw error
    return data
  }
}
