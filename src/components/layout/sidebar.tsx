'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ActorActual } from '@/lib/auth/session'
import type { AccountScopeData } from '@/lib/tenant/accountScope'
import { createClient } from '@/lib/supabase/client'
import { AccountScopeSwitcher } from './AccountScopeSwitcher'

type NavItem = {
  href: string
  label: string
}

interface SidebarProps {
  actor: ActorActual
  accountScope: AccountScopeData
}

const primaryItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/empleados', label: 'Empleados' },
  { href: '/pdvs', label: 'PDVs' },
  { href: '/ruta-semanal', label: 'Ruta semanal' },
  { href: '/asignaciones', label: 'Asignaciones' },
  { href: '/asistencias', label: 'Asistencias' },
  { href: '/ventas', label: 'Ventas' },
]

const adminItems: NavItem[] = [
  { href: '/clientes', label: 'Clientes' },
  { href: '/nomina', label: 'Nomina' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/offline', label: 'Offline' },
  { href: '/configuracion', label: 'Configuracion' },
  { href: '/reglas', label: 'Reglas' },
  { href: '/admin/users', label: 'Usuarios' },
]

function formatPuesto(value: string) {
  return value.replace(/_/g, ' ')
}

export function Sidebar({ actor, accountScope }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur lg:inset-y-0 lg:left-0 lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-6 py-5">
          <Link href="/dashboard" className="block">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              Field Force Platform
            </p>
            <h1 className="mt-2 text-xl font-semibold text-slate-950">
              Operacion Retail
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Base navegable alineada a los documentos de producto.
            </p>
          </Link>

          <div className="mt-4 rounded-2xl bg-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Sesion activa
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{actor.nombreCompleto}</p>
            <p className="mt-1 text-xs text-slate-600">{formatPuesto(actor.puesto)}</p>
            <p className="mt-3 text-xs text-slate-500">
              {accountScope.enabled
                ? `Alcance: ${accountScope.currentAccountLabel}`
                : actor.cuentaClienteId
                  ? 'Cuenta cliente operativa asignada'
                  : 'Sin cuenta cliente operativa'}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          {accountScope.enabled && (
            <div className="mb-6">
              <AccountScopeSwitcher
                key={accountScope.currentAccountId ?? 'global'}
                currentAccountId={accountScope.currentAccountId}
                currentAccountLabel={accountScope.currentAccountLabel}
                options={accountScope.options}
              />
            </div>
          )}
          <Section title="Operacion" items={primaryItems} pathname={pathname} />
          <Section title="Control" items={adminItems} pathname={pathname} />
        </nav>

        <div className="border-t border-slate-200 p-4">
          <button
            onClick={handleLogout}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
    </aside>
  )
}

function Section({
  title,
  items,
  pathname,
}: {
  title: string
  items: NavItem[]
  pathname: string
}) {
  return (
    <div className="mb-8">
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <div className="mt-3 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-2xl px-3 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}