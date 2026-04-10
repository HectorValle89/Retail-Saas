'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { List, X } from '@phosphor-icons/react'
import type { ActorActual } from '@/lib/auth/session'
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock'
import { PremiumLineIcon, type PremiumIconName } from '@/components/ui/premium-icons'
import { getModuleTheme, moduleThemeToStyle, type ModuleThemeKey } from '@/lib/ui/moduleThemes'
import type { Puesto } from '@/types/database'

type NavItem = {
  href: string
  label: string
  prefetch?: boolean
  allowedRoles: Puesto[]
  icon: NavIconName
  theme: ModuleThemeKey
}

type NavIconName =
  | 'dashboard'
  | 'employees'
  | 'stores'
  | 'route'
  | 'campaigns'
  | 'training'
  | 'assignments'
  | 'attendance'
  | 'sales'
  | 'heart'
  | 'requests'
  | 'messages'
  | 'clients'
  | 'payroll'
  | 'expenses'
  | 'materials'
  | 'reports'
  | 'offline'
  | 'settings'
  | 'rules'
  | 'users'

interface SidebarProps {
  actor: ActorActual
}

const primaryItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    theme: 'dashboard',
    prefetch: true,
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'NOMINA', 'LOGISTICA', 'LOVE_IS', 'VENTAS', 'DERMOCONSEJERO', 'CLIENTE'],
  },
  {
    href: '/empleados',
    label: 'Empleados',
    icon: 'employees',
    theme: 'empleados',
    prefetch: true,
    allowedRoles: ['ADMINISTRADOR', 'RECLUTAMIENTO'],
  },
  {
    href: '/pdvs',
    label: 'PDVs',
    icon: 'stores',
    theme: 'pdvs',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA', 'LOVE_IS', 'VENTAS', 'CLIENTE'],
  },
  {
    href: '/ruta-semanal',
    label: 'Ruta semanal',
    icon: 'route',
    theme: 'ruta-semanal',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR'],
  },
  {
    href: '/campanas',
    label: 'Campanas',
    icon: 'campaigns',
    theme: 'campanas',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA', 'VENTAS', 'DERMOCONSEJERO', 'CLIENTE'],
  },
  {
    href: '/formaciones',
    label: 'Formaciones',
    icon: 'training',
    theme: 'formaciones',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOVE_IS', 'VENTAS', 'DERMOCONSEJERO'],
  },
  {
    href: '/asignaciones',
    label: 'Asignaciones',
    icon: 'assignments',
    theme: 'asignaciones',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR'],
  },
  {
    href: '/asistencias',
    label: 'Asistencias',
    icon: 'attendance',
    theme: 'asistencias',
    prefetch: true,
    allowedRoles: ['ADMINISTRADOR', 'COORDINADOR', 'NOMINA'],
  },
  {
    href: '/ventas',
    label: 'Ventas',
    icon: 'sales',
    theme: 'ventas',
    prefetch: true,
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'VENTAS', 'DERMOCONSEJERO'],
  },
  {
    href: '/love-isdin',
    label: 'LOVE ISDIN',
    icon: 'heart',
    theme: 'love-isdin',
    allowedRoles: ['ADMINISTRADOR', 'LOVE_IS', 'DERMOCONSEJERO'],
  },
  {
    href: '/solicitudes',
    label: 'Solicitudes',
    icon: 'requests',
    theme: 'solicitudes',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'DERMOCONSEJERO'],
  },
  {
    href: '/mensajes',
    label: 'Mensajes',
    icon: 'messages',
    theme: 'mensajes',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'NOMINA', 'LOGISTICA', 'LOVE_IS', 'VENTAS', 'DERMOCONSEJERO'],
  },
]

const adminItems: NavItem[] = [
  { href: '/clientes', label: 'Clientes', icon: 'clients', theme: 'clientes', allowedRoles: ['ADMINISTRADOR'] },
  { href: '/nomina', label: 'Nomina', icon: 'payroll', theme: 'nomina', allowedRoles: ['ADMINISTRADOR', 'NOMINA'] },
  { href: '/gastos', label: 'Gastos', icon: 'expenses', theme: 'gastos', allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA'] },
  { href: '/materiales', label: 'Materiales', icon: 'materials', theme: 'materiales', allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA'] },
  { href: '/reportes', label: 'Reportes', icon: 'reports', theme: 'reportes', allowedRoles: ['ADMINISTRADOR'] },
  { href: '/offline', label: 'Offline', icon: 'offline', theme: 'offline', allowedRoles: ['ADMINISTRADOR'] },
  { href: '/configuracion', label: 'Configuracion', icon: 'settings', theme: 'configuracion', allowedRoles: ['ADMINISTRADOR'] },
  { href: '/reglas', label: 'Reglas', icon: 'rules', theme: 'reglas', allowedRoles: ['ADMINISTRADOR'] },
  { href: '/admin/users', label: 'Usuarios', icon: 'users', theme: 'usuarios', allowedRoles: ['ADMINISTRADOR'] },
]

function formatPuesto(value: string) {
  return value.replace(/_/g, ' ')
}

function MenuIcon() {
  return <List className="h-5 w-5" weight="regular" aria-hidden="true" />
}

function CloseIcon() {
  return <X className="h-5 w-5" weight="regular" aria-hidden="true" />
}

function NavIcon({ name, className = 'h-5 w-5' }: { name: NavIconName; className?: string }) {
  return <PremiumLineIcon name={name as PremiumIconName} className={className} strokeWidth={1.85} />
}

export function Sidebar({ actor }: SidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) {
      return
    }

    return lockBodyScroll()
  }, [mobileOpen])

  const handleLogout = async () => {
    window.location.assign('/logout')
  }

  const visiblePrimaryItems = primaryItems.filter((item) => item.allowedRoles.includes(actor.puesto))
  const visibleAdminItems = adminItems.filter((item) => item.allowedRoles.includes(actor.puesto))

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-700">
              Beteele One
            </p>
            <p className="truncate font-heading text-sm font-semibold text-slate-950">ISDIN</p>
          </Link>

          <button
            type="button"
            aria-label={mobileOpen ? 'Cerrar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((current) => !current)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/80 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-72 lg:border-r lg:border-border/70 lg:bg-white/95 lg:backdrop-blur">
        <SidebarContent
          actor={actor}
          pathname={pathname}
          onLogout={handleLogout}
          primaryItems={visiblePrimaryItems}
          adminItems={visibleAdminItems}
        />
      </aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Cerrar navegacion"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden"
          />

          <aside className="fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-1rem))] overflow-y-auto border-r border-border/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] lg:hidden">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-700">
                  Beteele One
                </p>
                <p className="font-heading text-sm font-semibold text-slate-950">ISDIN</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar menu"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/80 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
              >
                <CloseIcon />
              </button>
            </div>

            <SidebarContent
              actor={actor}
              pathname={pathname}
              onLogout={handleLogout}
              primaryItems={visiblePrimaryItems}
              adminItems={visibleAdminItems}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  )
}

function SidebarContent({
  actor,
  pathname,
  onLogout,
  primaryItems,
  adminItems,
  onNavigate,
}: {
  actor: ActorActual
  pathname: string
  onLogout: () => Promise<void>
  primaryItems: NavItem[]
  adminItems: NavItem[]
  onNavigate?: () => void
}) {
  const initials = actor.nombreCompleto
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-6 py-5">
        <div className="flex items-start gap-3">
          <Link href="/dashboard" className="block min-w-0 flex-1" onClick={onNavigate}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-700">
              Beteele One
            </p>
            <div className="mt-2 min-w-0">
              <h1 className="font-heading text-lg font-semibold text-slate-950">ISDIN</h1>
              <p className="mt-1 truncate text-xs text-slate-500">Operacion central</p>
            </div>
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-sm font-semibold text-primary-700">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{actor.nombreCompleto}</p>
            <p className="truncate text-xs text-slate-500">{formatPuesto(actor.puesto)}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6">
        {primaryItems.length > 0 && (
          <Section title="Modulos" items={primaryItems} pathname={pathname} onNavigate={onNavigate} />
        )}
        {adminItems.length > 0 && (
          <Section title="Gestion" items={adminItems} pathname={pathname} onNavigate={onNavigate} />
        )}
      </nav>

      <div className="border-t border-border/70 p-4">
        <button
          onClick={() => void onLogout()}
          className="w-full rounded-[16px] border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-primary-200 hover:bg-primary-50"
        >
          Cerrar sesion
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <div className="mb-8">
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <div className="mt-3 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href
          const theme = getModuleTheme(item.theme)
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.prefetch ?? false}
          onClick={onNavigate}
          style={moduleThemeToStyle(theme)}
          className={`flex items-center gap-3 rounded-[16px] px-3.5 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-[var(--module-soft-bg)] text-[var(--module-text)] shadow-[inset_0_0_0_1px_var(--module-border)]'
                  : 'text-slate-600 hover:bg-surface-subtle hover:text-slate-950'
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
                  isActive
                    ? 'bg-[var(--module-soft-bg)] text-[var(--module-text)]'
                    : 'bg-[var(--module-soft-bg)] text-[var(--module-primary)]'
                }`}
              >
                <NavIcon name={item.icon} />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}


