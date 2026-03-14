'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { CreateLawyerDTO, UpdateLawyerDTO } from '@/types/database'

export async function createLawyer(data: CreateLawyerDTO) {
  const supabase = await createClient()

  const { error } = await supabase.from('lawyers').insert(data)

  if (error) return { error: error.message }

  // Actualizar rol del usuario a lawyer
  await supabase
    .from('profiles')
    .update({ role: 'lawyer' })
    .eq('id', data.user_id)

  revalidatePath('/lawyers')
  return { success: true }
}

export async function updateLawyer(id: string, data: UpdateLawyerDTO) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('lawyers')
    .update(data)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/lawyers')
  revalidatePath(`/lawyers/${id}`)
  return { success: true }
}

export async function getLawyerByUserId(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('lawyers')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) return null
  return data
}
