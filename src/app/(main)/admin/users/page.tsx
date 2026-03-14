import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserManagement } from './UserManagement'

export const metadata = {
  title: 'Gestión de Usuarios | LexAgenda Admin'
}

export default async function AdminUsersPage() {
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

  // Obtener todos los usuarios
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  // Obtener estadísticas
  const stats = {
    total: users?.length || 0,
    admins: users?.filter(u => u.role === 'admin').length || 0,
    lawyers: users?.filter(u => u.role === 'lawyer').length || 0,
    clients: users?.filter(u => u.role === 'client').length || 0,
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
        <p className="text-foreground-secondary mt-1">
          Administra usuarios y asigna roles del sistema
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4">
          <p className="text-sm text-foreground-secondary">Total Usuarios</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </Card>
        <Card className="p-4 border-l-4 border-secondary-500">
          <p className="text-sm text-foreground-secondary">Administradores</p>
          <p className="text-2xl font-bold text-secondary-600">{stats.admins}</p>
        </Card>
        <Card className="p-4 border-l-4 border-accent-500">
          <p className="text-sm text-foreground-secondary">Abogados</p>
          <p className="text-2xl font-bold text-accent-600">{stats.lawyers}</p>
        </Card>
        <Card className="p-4 border-l-4 border-success-500">
          <p className="text-sm text-foreground-secondary">Clientes</p>
          <p className="text-2xl font-bold text-success-600">{stats.clients}</p>
        </Card>
      </div>

      {/* Users Table */}
      <UserManagement initialUsers={users || []} />
    </div>
  )
}
