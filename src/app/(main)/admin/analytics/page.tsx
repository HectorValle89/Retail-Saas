import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { AnalyticsDashboard } from './AnalyticsDashboard'

export const metadata = {
  title: 'Analytics | LexAgenda Admin'
}

export default async function AdminAnalyticsPage() {
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

  // Calcular fechas
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

  // Obtener citas del mes actual
  const { data: currentMonthAppointments } = await supabase
    .from('appointments')
    .select('*, appointment_type:appointment_types(price)')
    .gte('scheduled_at', startOfMonth.toISOString())
    .lte('scheduled_at', endOfMonth.toISOString())

  // Obtener citas del mes anterior
  const { data: lastMonthAppointments } = await supabase
    .from('appointments')
    .select('*, appointment_type:appointment_types(price)')
    .gte('scheduled_at', startOfLastMonth.toISOString())
    .lte('scheduled_at', endOfLastMonth.toISOString())

  // Obtener clientes nuevos del mes
  const { data: newClients } = await supabase
    .from('clients')
    .select('id')
    .gte('created_at', startOfMonth.toISOString())

  const { data: lastMonthClients } = await supabase
    .from('clients')
    .select('id')
    .gte('created_at', startOfLastMonth.toISOString())
    .lte('created_at', endOfLastMonth.toISOString())

  // Obtener abogados con sus citas
  const { data: lawyers } = await supabase
    .from('lawyers')
    .select(`
      id,
      hourly_rate,
      profile:profiles(full_name),
      appointments(id, status, scheduled_at, duration_minutes, appointment_type:appointment_types(price))
    `)
    .eq('is_active', true)

  // Calcular métricas
  const currentAppts = currentMonthAppointments || []
  const lastAppts = lastMonthAppointments || []

  // Ingresos
  const currentRevenue = currentAppts
    .filter(a => a.status === 'completed' || a.status === 'paid')
    .reduce((sum, a) => sum + (a.appointment_type?.price || 0), 0)

  const lastRevenue = lastAppts
    .filter(a => a.status === 'completed' || a.status === 'paid')
    .reduce((sum, a) => sum + (a.appointment_type?.price || 0), 0)

  // Cuentas por cobrar (completadas pero no pagadas)
  const accountsReceivable = currentAppts
    .filter(a => a.status === 'completed')
    .reduce((sum, a) => sum + (a.appointment_type?.price || 0), 0)

  // Tasa de conversión
  const completedAppointments = currentAppts.filter(a => a.status === 'completed' || a.status === 'paid').length
  const totalAppointments = currentAppts.length
  const conversionRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0

  // Métricas por abogado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lawyerMetrics = (lawyers || []).map((lawyer: any) => {
    const lawyerAppts = lawyer.appointments || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthAppts = lawyerAppts.filter((a: any) => {
      const date = new Date(a.scheduled_at)
      return date >= startOfMonth && date <= endOfMonth
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completedAppts = monthAppts.filter((a: any) =>
      a.status === 'completed' || a.status === 'paid'
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const revenue = completedAppts.reduce((sum: number, a: any) =>
      sum + (a.appointment_type?.price || 0), 0
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hoursWorked = completedAppts.reduce((sum: number, a: any) =>
      sum + ((a.duration_minutes || 60) / 60), 0
    )
    const utilizationRate = hoursWorked > 0 ? (hoursWorked / 160) * 100 : 0 // Assuming 160 hours/month

    return {
      id: lawyer.id,
      name: lawyer.profile?.full_name || 'Sin nombre',
      appointments: monthAppts.length,
      completed: completedAppts.length,
      revenue,
      hoursWorked: Math.round(hoursWorked * 10) / 10,
      utilizationRate: Math.round(utilizationRate),
      hourlyRate: lawyer.hourly_rate,
    }
  })

  const stats = {
    revenue: {
      current: currentRevenue,
      previous: lastRevenue,
      change: lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue) * 100 : 0,
    },
    appointments: {
      current: currentAppts.length,
      previous: lastAppts.length,
      change: lastAppts.length > 0 ? ((currentAppts.length - lastAppts.length) / lastAppts.length) * 100 : 0,
    },
    clients: {
      new: newClients?.length || 0,
      previousNew: lastMonthClients?.length || 0,
    },
    conversionRate,
    accountsReceivable,
    lawyerMetrics,
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <AnalyticsDashboard stats={stats} />
    </div>
  )
}
