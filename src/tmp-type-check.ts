import type { Database } from '@/types/database'

type UserUpdate = Database['public']['Tables']['usuario']['Update']

const example: UserUpdate = {
  ultimo_acceso_en: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

console.log(example)
