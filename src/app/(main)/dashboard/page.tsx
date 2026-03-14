import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { dashboardService } from '@/features/dashboard/services/dashboardService'

export const metadata = {
  title: 'Dashboard | Retail App'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtener rol del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role || 'client'
  const userName = profile?.full_name || user.email?.split('@')[0] || 'Usuario'

  const greeting = getGreeting()

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {greeting}, {userName}
        </h1>
        <p className="text-foreground-secondary mt-1">
          Bienvenido al sistema de gestión Retail.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-500 text-sm font-medium">Proyectos Activos</h3>
          <p className="text-2xl font-bold mt-2">0</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-500 text-sm font-medium">Tareas Pendientes</h3>
          <p className="text-2xl font-bold mt-2">0</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-500 text-sm font-medium">Notificaciones</h3>
          <p className="text-2xl font-bold mt-2">0</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
        <p className="text-gray-400">Próximamente: Panel de control de operaciones Retail.</p>
      </div>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}
