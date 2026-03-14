'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Profile, UserRole } from '@/types/database'

interface UserManagementProps {
  initialUsers: Profile[]
}

const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'bg-secondary-100 text-secondary-700' },
  { value: 'lawyer', label: 'Abogado', color: 'bg-accent-100 text-accent-700' },
  { value: 'client', label: 'Cliente', color: 'bg-success-100 text-success-700' },
]

export function UserManagement({ initialUsers }: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers)
  const [filter, setFilter] = useState<UserRole | 'all'>('all')
  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const filteredUsers = users.filter(user => {
    const matchesFilter = filter === 'all' || user.role === filter
    const matchesSearch =
      user.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (!error) {
      setUsers(users.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ))
    }

    setSaving(false)
    setEditingUser(null)
  }

  const getRoleBadge = (role: UserRole) => {
    const roleConfig = ROLES.find(r => r.value === role)
    return roleConfig || ROLES[2]
  }

  return (
    <Card className="overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-border bg-gray-50/50 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-primary-500 text-white'
                : 'bg-white border border-border text-foreground-secondary hover:bg-gray-50'
            }`}
          >
            Todos
          </button>
          {ROLES.map(role => (
            <button
              key={role.value}
              onClick={() => setFilter(role.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter === role.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-white border border-border text-foreground-secondary hover:bg-gray-50'
              }`}
            >
              {role.label}s
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Usuario</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Email</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Rol</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-foreground-secondary">Registrado</th>
              <th className="text-right px-6 py-4 text-sm font-semibold text-foreground-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.map((user) => {
              const roleBadge = getRoleBadge(user.role)
              const isEditing = editingUser === user.id

              return (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary-600">
                          {user.full_name?.slice(0, 2).toUpperCase() || user.email.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {user.full_name || 'Sin nombre'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-foreground-secondary">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    {isEditing ? (
                      <div className="flex gap-2">
                        {ROLES.map(role => (
                          <button
                            key={role.value}
                            onClick={() => handleRoleChange(user.id, role.value)}
                            disabled={saving}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                              user.role === role.value
                                ? `${role.color} ring-2 ring-offset-2 ring-primary-500`
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {role.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={`px-3 py-1 rounded-lg text-xs font-medium ${roleBadge.color}`}>
                        {roleBadge.label}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground-secondary">
                    {new Date(user.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isEditing ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser(null)}
                      >
                        Cancelar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser(user.id)}
                      >
                        Cambiar Rol
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-foreground-secondary">No se encontraron usuarios</p>
          </div>
        )}
      </div>
    </Card>
  )
}
