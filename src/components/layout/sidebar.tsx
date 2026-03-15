'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavItem = {
  href: string
  label: string
}

const primaryItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/empleados', label: 'Empleados' },
  { href: '/pdvs', label: 'PDVs' },
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
  { href: '/admin/users', label: 'Usuarios' },
]

export function Sidebar() {
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
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
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
