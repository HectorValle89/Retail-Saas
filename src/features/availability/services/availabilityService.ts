import { createClient } from '@/lib/supabase/client'

export const availabilityService = {
  /**
   * Obtiene slots disponibles para un abogado en una fecha específica
   * Considera: availability + citas ya agendadas
   */
  async getAvailableSlots(lawyerId: string, date: Date): Promise<string[]> {
    const supabase = createClient()
    const dayOfWeek = date.getDay()

    // 1. Obtener disponibilidad del día
    const { data: availability } = await supabase
      .from('availability')
      .select('*')
      .eq('lawyer_id', lawyerId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)
      .single()

    if (!availability) return []

    // 2. Obtener citas del día
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const { data: appointments } = await supabase
      .from('appointments')
      .select('scheduled_at, duration_minutes')
      .eq('lawyer_id', lawyerId)
      .gte('scheduled_at', startOfDay.toISOString())
      .lte('scheduled_at', endOfDay.toISOString())
      .in('status', ['pending', 'confirmed'])

    // 3. Generar slots y filtrar ocupados
    const allSlots = generateTimeSlots(
      availability.start_time,
      availability.end_time,
      30 // intervalo en minutos
    )

    const bookedSlots = new Set(
      (appointments || []).map(a =>
        new Date(a.scheduled_at).toTimeString().slice(0, 5)
      )
    )

    return allSlots.filter(slot => !bookedSlots.has(slot))
  },

  async getLawyerAvailability(lawyerId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('lawyer_id', lawyerId)
      .order('day_of_week')

    if (error) throw error
    return data
  }
}

function generateTimeSlots(start: string, end: string, interval: number): string[] {
  const slots: string[] = []
  const [startH, startM] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)

  let current = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  while (current < endMinutes) {
    const hours = Math.floor(current / 60)
    const mins = current % 60
    slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`)
    current += interval
  }

  return slots
}
