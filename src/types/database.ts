// ============================================
// TIPOS DEL DOMINIO - LexAgenda
// ============================================

export type UserRole = 'client' | 'lawyer' | 'admin'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Lawyer {
  id: string
  user_id: string
  specialty: string
  bio: string | null
  experience_years: number
  hourly_rate: number
  rating: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Relaciones
  profile?: Profile
}

export interface Client {
  id: string
  user_id: string | null // null for guest clients
  full_name: string | null // Direct name for guest clients
  email: string | null // Direct email for guest clients
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relaciones
  profile?: Profile | null
}

export interface AppointmentType {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  is_active: boolean
  created_at: string
}

export interface Availability {
  id: string
  lawyer_id: string
  day_of_week: number // 0=Domingo, 6=Sabado
  start_time: string // "09:00"
  end_time: string // "17:00"
  is_available: boolean
  created_at: string
}

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'paid'
  | 'no_show'

export interface Appointment {
  id: string
  client_id: string
  lawyer_id: string
  appointment_type_id: string | null
  scheduled_at: string
  duration_minutes: number
  status: AppointmentStatus
  notes: string | null
  client_notes: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  // Relaciones expandidas
  client?: Client & { profile: Profile }
  lawyer?: Lawyer & { profile: Profile }
  appointment_type?: AppointmentType
}

// ============================================
// DTOs para operaciones
// ============================================

export interface CreateAppointmentDTO {
  lawyer_id: string
  appointment_type_id: string
  scheduled_at: string
  client_notes?: string
}

export interface UpdateAppointmentDTO {
  status?: AppointmentStatus
  notes?: string
  scheduled_at?: string
  cancellation_reason?: string
}

export interface CreateLawyerDTO {
  user_id: string
  specialty: string
  bio?: string
  experience_years?: number
  hourly_rate?: number
}

export interface UpdateLawyerDTO {
  specialty?: string
  bio?: string
  experience_years?: number
  hourly_rate?: number
  is_active?: boolean
}

export interface AvailabilitySlot {
  day_of_week: number
  start_time: string
  end_time: string
  is_available: boolean
}

// ============================================
// Tipo expandido de Lawyer con perfil
// ============================================

export interface LawyerWithProfile extends Lawyer {
  profile: Profile
  availability?: Availability[]
}

export interface AppointmentWithRelations extends Omit<Appointment, 'client' | 'lawyer' | 'appointment_type'> {
  client: Client & { profile?: Profile | null }
  lawyer: Lawyer & { profile: Profile }
  appointment_type: AppointmentType | null
}

// ============================================
// Sistema de Precios y Servicios
// ============================================

export type PricingType = 'hourly' | 'fixed'

export interface ServicePricing {
  id: string
  lawyer_id: string
  service_name: string
  pricing_type: PricingType
  hourly_rate: number | null
  fixed_price: number | null
  duration_minutes: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateServicePricingDTO {
  lawyer_id: string
  service_name: string
  pricing_type: PricingType
  hourly_rate?: number
  fixed_price?: number
  duration_minutes: number
  description?: string
}

// ============================================
// Sistema de Pagos
// ============================================

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'
export type PaymentMethod = 'card' | 'transfer' | 'cash'

export interface Payment {
  id: string
  appointment_id: string
  amount: number
  status: PaymentStatus
  payment_method: PaymentMethod | null
  transaction_id: string | null
  paid_at: string | null
  created_at: string
  // Relaciones
  appointment?: Appointment
}

// ============================================
// Sistema de Notificaciones
// ============================================

export type NotificationType =
  | 'appointment_created'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'appointment_reminder'
  | 'payment_received'
  | 'case_update'
  | 'document_request'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  data: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

// ============================================
// Sistema de Proyectos/Casos
// ============================================

export type ProjectStatus = 'pending' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Project {
  id: string
  lawyer_id: string
  client_id: string | null
  title: string
  description: string | null
  status: ProjectStatus
  case_type: string | null
  start_date: string
  due_date: string | null
  budget: number
  amount_paid: number
  priority: ProjectPriority
  notes: string | null
  created_at: string
  updated_at: string
  // Relaciones
  lawyer?: Lawyer & { profile: Profile }
  client?: (Client & { profile?: Profile | null }) | null
}

export interface ProjectWithRelations extends Omit<Project, 'lawyer' | 'client'> {
  lawyer: Lawyer & { profile: Profile }
  client: (Client & { profile?: Profile | null }) | null
}

// ============================================
// Permisos por Rol
// ============================================

export const ROLE_PERMISSIONS = {
  admin: {
    canViewAllAppointments: true,
    canViewFinancials: true,
    canManageUsers: true,
    canManageLawyers: true,
    canViewAnalytics: true,
    canConfigurePricing: true,
    canViewAllCases: true,
  },
  lawyer: {
    canViewAllAppointments: false,
    canViewFinancials: false,
    canManageUsers: false,
    canManageLawyers: false,
    canViewAnalytics: false,
    canConfigurePricing: false,
    canViewAllCases: false,
  },
  client: {
    canViewAllAppointments: false,
    canViewFinancials: false,
    canManageUsers: false,
    canManageLawyers: false,
    canViewAnalytics: false,
    canConfigurePricing: false,
    canViewAllCases: false,
  },
} as const

export type Permission = keyof typeof ROLE_PERMISSIONS.admin

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role][permission]
}

// ============================================
// Database type para Supabase client
// ============================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      lawyers: {
        Row: Lawyer
        Insert: CreateLawyerDTO
        Update: UpdateLawyerDTO
      }
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Client, 'id' | 'created_at'>>
      }
      appointment_types: {
        Row: AppointmentType
        Insert: Omit<AppointmentType, 'id' | 'created_at'>
        Update: Partial<Omit<AppointmentType, 'id' | 'created_at'>>
      }
      availability: {
        Row: Availability
        Insert: Omit<Availability, 'id' | 'created_at'>
        Update: Partial<Omit<Availability, 'id' | 'created_at'>>
      }
      appointments: {
        Row: Appointment
        Insert: CreateAppointmentDTO & { client_id: string }
        Update: UpdateAppointmentDTO
      }
    }
  }
}
