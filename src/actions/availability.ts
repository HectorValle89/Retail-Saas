'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface AvailabilityData {
  day_of_week: number
  start_time: string
  end_time: string
  is_available: boolean
}

export async function updateLawyerAvailability(
  lawyerId: string,
  availabilities: AvailabilityData[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'No autenticado' }

  // Verificar que el usuario es el abogado
  const { data: lawyer } = await supabase
    .from('lawyers')
    .select('id')
    .eq('id', lawyerId)
    .eq('user_id', user.id)
    .single()

  if (!lawyer) return { error: 'No autorizado' }

  // Eliminar disponibilidades existentes
  await supabase
    .from('availability')
    .delete()
    .eq('lawyer_id', lawyerId)

  // Insertar nuevas
  const { error } = await supabase
    .from('availability')
    .insert(
      availabilities.map(a => ({
        ...a,
        lawyer_id: lawyerId
      }))
    )

  if (error) return { error: error.message }

  revalidatePath(`/lawyers/${lawyerId}`)
  return { success: true }
}

export async function toggleDayAvailability(
  lawyerId: string,
  dayOfWeek: number,
  isAvailable: boolean
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('availability')
    .upsert({
      lawyer_id: lawyerId,
      day_of_week: dayOfWeek,
      is_available: isAvailable,
      start_time: '09:00:00',
      end_time: '18:00:00'
    }, {
      onConflict: 'lawyer_id,day_of_week'
    })

  if (error) return { error: error.message }

  revalidatePath(`/lawyers/${lawyerId}`)
  return { success: true }
}
