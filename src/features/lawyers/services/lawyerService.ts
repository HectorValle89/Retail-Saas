import { createClient } from '@/lib/supabase/client'
import type { LawyerWithProfile } from '@/types/database'

export interface LawyerFilters {
  specialty?: string
  isActive?: boolean
}

export const lawyerService = {
  async getAll(filters?: LawyerFilters): Promise<LawyerWithProfile[]> {
    const supabase = createClient()
    let query = supabase
      .from('lawyers')
      .select(`
        *,
        profile:profiles(id, full_name, email, avatar_url, role)
      `)
      .order('rating', { ascending: false })

    if (filters?.specialty) {
      query = query.eq('specialty', filters.specialty)
    }
    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive)
    }

    const { data, error } = await query
    if (error) throw error
    return data as LawyerWithProfile[]
  },

  async getById(id: string): Promise<LawyerWithProfile | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('lawyers')
      .select(`
        *,
        profile:profiles(id, full_name, email, avatar_url, role),
        availability(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as LawyerWithProfile
  },

  async getSpecialties(): Promise<string[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('lawyers')
      .select('specialty')
      .eq('is_active', true)

    if (error) throw error
    return [...new Set(data.map(l => l.specialty))]
  }
}
