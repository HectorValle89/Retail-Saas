'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { List, UserCircle, X } from '@phosphor-icons/react';
import type { ActorActual } from '@/lib/auth/session';
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock';
import { AppGlyph, type AppGlyphName } from '@/components/ui/AppGlyph';
import { getModuleTheme, moduleThemeToStyle, type ModuleThemeKey } from '@/lib/ui/moduleThemes';
import type { Puesto } from '@/types/database';

type NavItem = {
  href: string;
  label: string;
  prefetch?: boolean;
  allowedRoles: Puesto[];
  icon: AppGlyphName;
  theme: ModuleThemeKey;
};

type NavIconName = AppGlyphName;

interface SidebarProps {
  actor: ActorActual;
}

const primaryItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    theme: 'dashboard',
    allowedRoles: [
      'ADMINISTRADOR',
      'SUPERVISOR',
      'COORDINADOR',
      'RECLUTAMIENTO',
      'NOMINA',
      'LOGISTICA',
      'LOVE_IS',
      'VENTAS',
      'DERMOCONSEJERO',
      'CLIENTE',
    ],
  },
  {
    href: '/empleados',
    label: 'Empleados',
    icon: 'employees',
    theme: 'empleados',
    allowedRoles: ['ADMINISTRADOR', 'RECLUTAMIENTO', 'COORDINADOR'],
  },
  {
    href: '/reclutamiento',
    label: 'Reclutamiento',
    icon: 'reclutamiento',
    theme: 'reclutamiento',
    allowedRoles: ['ADMINISTRADOR', 'RECLUTAMIENTO', 'COORDINADOR'],
  },
  {
    href: '/pdvs',
    label: 'PDVs',
    icon: 'stores',
    theme: 'pdvs',
    allowedRoles: [
      'ADMINISTRADOR',
      'SUPERVISOR',
      'COORDINADOR',
      'LOGISTICA',
      'LOVE_IS',
      'VENTAS',
      'CLIENTE',
    ],
  },
  {
    href: '/ruta-semanal',
    label: 'Ruta mensual',
    icon: 'ruta-hoy',
    theme: 'ruta-semanal',
    allowedRoles: ['SUPERVISOR'],
  },
  {
    href: '/operacion-supervisores',
    label: 'Operación de Supervisores',
    icon: 'operacion-supervisores',
    theme: 'ruta-semanal',
    allowedRoles: ['ADMINISTRADOR', 'COORDINADOR'],
  },
  {
    href: '/campanas',
    label: 'Campanas',
    icon: 'campanas',
    theme: 'campanas',
    allowedRoles: [
      'ADMINISTRADOR',
      'SUPERVISOR',
      'COORDINADOR',
      'LOGISTICA',
      'VENTAS',
      'DERMOCONSEJERO',
      'CLIENTE',
    ],
  },
  {
    href: '/formaciones',
    label: 'Formaciones',
    icon: 'formaciones',
    theme: 'formaciones',
    allowedRoles: [
      'ADMINISTRADOR',
      'SUPERVISOR',
      'COORDINADOR',
      'LOVE_IS',
      'VENTAS',
      'DERMOCONSEJERO',
    ],
  },
  {
    href: '/asignaciones',
    label: 'Asignaciones',
    icon: 'asignaciones',
    theme: 'asignaciones',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA'],
  },
  {
    href: '/asistencias',
    label: 'Asistencias',
    icon: 'asistencia',
    theme: 'asistencias',
    allowedRoles: ['ADMINISTRADOR', 'COORDINADOR', 'NOMINA'],
  },
  {
    href: '/ventas',
    label: 'Ventas',
    icon: 'ventas',
    theme: 'ventas',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'VENTAS', 'DERMOCONSEJERO'],
  },
  {
    href: '/love-isdin',
    label: 'LOVE ISDIN',
    icon: 'love',
    theme: 'love-isdin',
    allowedRoles: ['ADMINISTRADOR', 'LOVE_IS', 'DERMOCONSEJERO'],
  },
  {
    href: '/solicitudes',
    label: 'Solicitudes',
    icon: 'solicitudes',
    theme: 'solicitudes',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'DERMOCONSEJERO'],
  },
  {
    href: '/canjes',
    label: 'Canjes',
    icon: 'canjes',
    theme: 'materiales',
    allowedRoles: ['ADMINISTRADOR', 'COORDINADOR'],
  },
  {
    href: '/evidencias-entregas',
    label: 'Entregas y Evidencias',
    icon: 'evidencias',
    theme: 'evidencias-entregas',
    allowedRoles: ['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA', 'SUPERVISOR', 'CLIENTE'],
  },
  {
    href: '/mensajes',
    label: 'Mensajes',
    icon: 'mensajes',
    theme: 'mensajes',
    allowedRoles: [
      'ADMINISTRADOR',
      'SUPERVISOR',
      'COORDINADOR',
      'RECLUTAMIENTO',
      'NOMINA',
      'LOGISTICA',
      'LOVE_IS',
      'VENTAS',
      'DERMOCONSEJERO',
    ],
  },
];

const adminItems: NavItem[] = [
  {
    href: '/clientes',
    label: 'Clientes',
    icon: 'clientes',
    theme: 'clientes',
    allowedRoles: ['ADMINISTRADOR'],
  },
  {
    href: '/nomina',
    label: 'Nomina',
    icon: 'nomina',
    theme: 'nomina',
    allowedRoles: ['ADMINISTRADOR', 'NOMINA'],
  },
  {
    href: '/gastos',
    label: 'Gastos',
    icon: 'gastos',
    theme: 'gastos',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA'],
  },
  {
    href: '/materiales',
    label: 'Inventarios',
    icon: 'materiales',
    theme: 'materiales',
    allowedRoles: ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA'],
  },
  {
    href: '/reportes',
    label: 'Reportes',
    icon: 'reportes',
    theme: 'reportes',
    allowedRoles: ['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR'],
  },
  {
    href: '/offline',
    label: 'Offline',
    icon: 'offline',
    theme: 'offline',
    allowedRoles: ['ADMINISTRADOR'],
  },
  {
    href: '/configuracion',
    label: 'Configuracion',
    icon: 'configuracion',
    theme: 'configuracion',
    allowedRoles: ['ADMINISTRADOR'],
  },
  {
    href: '/reglas',
    label: 'Reglas',
    icon: 'reglas',
    theme: 'reglas',
    allowedRoles: ['ADMINISTRADOR'],
  },
  {
    href: '/admin/users',
    label: 'Usuarios',
    icon: 'usuarios',
    theme: 'usuarios',
    allowedRoles: ['ADMINISTRADOR'],
  },
];

function formatPuesto(value: string) {
  return value.replace(/_/g, ' ');
}

function MenuIcon() {
  return <List className="h-5 w-5" weight="regular" aria-hidden="true" />;
}

function CloseIcon() {
  return <X className="h-5 w-5" weight="regular" aria-hidden="true" />;
}

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  return <AppGlyph name={name} size="md" className={className} />;
}

export function Sidebar({ actor }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const desktopPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setMobileOpen(false);
        setDesktopOpen(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    return lockBodyScroll();
  }, [mobileOpen]);

  const handleLogout = async () => {
    window.location.assign('/logout');
  };

  const visiblePrimaryItems = primaryItems.filter((item) =>
    item.allowedRoles.includes(actor.puesto)
  );
  const visibleAdminItems = adminItems.filter((item) => item.allowedRoles.includes(actor.puesto));

  const closeDesktopMenuWhenIdle = () => {
    if (!desktopPanelRef.current?.contains(document.activeElement)) {
      setDesktopOpen(false);
    }
  };

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

      <aside
        ref={desktopPanelRef}
        id="desktop-module-navigation"
        data-testid="desktop-sidebar"
        data-state={desktopOpen ? 'expanded' : 'compact'}
        aria-label="Navegación de módulos"
        onPointerEnter={() => setDesktopOpen(true)}
        onPointerLeave={closeDesktopMenuWhenIdle}
        onFocusCapture={() => setDesktopOpen(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDesktopOpen(false);
          }
        }}
        className={`hidden overflow-hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:border-r lg:border-border/70 lg:bg-white/95 lg:backdrop-blur lg:transition-[width,box-shadow] lg:duration-200 lg:ease-out ${
          desktopOpen
            ? 'lg:w-72 lg:shadow-[20px_0_60px_rgba(15,23,42,0.12)]'
            : 'lg:w-[4.5rem] lg:shadow-[8px_0_24px_rgba(15,23,42,0.06)]'
        }`}
      >
        <DesktopSidebarContent
          actor={actor}
          pathname={pathname}
          onLogout={handleLogout}
          primaryItems={visiblePrimaryItems}
          adminItems={visibleAdminItems}
          expanded={desktopOpen}
          onToggle={() => setDesktopOpen((current) => !current)}
          onNavigate={() => setDesktopOpen(false)}
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
              mobile
            />
          </aside>
        </>
      )}
    </>
  );
}

function DesktopSidebarContent({
  actor,
  pathname,
  onLogout,
  primaryItems,
  adminItems,
  expanded,
  onToggle,
  onNavigate,
}: {
  actor: ActorActual;
  pathname: string;
  onLogout: () => Promise<void>;
  primaryItems: NavItem[];
  adminItems: NavItem[];
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const labelClass = `min-w-0 whitespace-nowrap transition-[opacity,transform] duration-150 ${
    expanded ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-1 opacity-0'
  }`;

  return (
    <div className="flex h-full w-72 min-w-72 flex-col">
      <div className="border-b border-border/70">
        <button
          type="button"
          data-testid="desktop-sidebar-toggle"
          aria-label={
            expanded ? 'Contraer navegación de módulos' : 'Expandir navegación de módulos'
          }
          aria-controls="desktop-module-navigation"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex h-16 w-full items-center gap-3 px-4 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
            <MenuIcon />
          </span>
          <span className={labelClass} aria-hidden={!expanded}>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-700">
              Beteele One
            </span>
            <span className="mt-0.5 block font-heading text-sm font-semibold text-slate-950">
              ISDIN
            </span>
          </span>
        </button>

        <div className="flex h-16 items-center gap-3 px-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <UserCircle className="h-5 w-5" weight="regular" aria-hidden="true" />
          </span>
          <span className={labelClass} aria-hidden={!expanded}>
            <span className="block max-w-[12.5rem] truncate text-sm font-semibold text-slate-950">
              {actor.nombreCompleto}
            </span>
            <span className="mt-0.5 block max-w-[12.5rem] truncate text-[11px] text-slate-500">
              {formatPuesto(actor.puesto)}
            </span>
          </span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {primaryItems.length > 0 && (
          <DesktopSection
            title="Módulos"
            items={primaryItems}
            pathname={pathname}
            expanded={expanded}
            onNavigate={onNavigate}
          />
        )}
        {adminItems.length > 0 && (
          <DesktopSection
            title="Gestión"
            items={adminItems}
            pathname={pathname}
            expanded={expanded}
            onNavigate={onNavigate}
          />
        )}
      </nav>

      <div className="border-t border-border/70 bg-white p-3">
        <button
          type="button"
          aria-label="Cerrar sesión"
          title={expanded ? undefined : 'Cerrar sesión'}
          onClick={() => void onLogout()}
          className={`flex h-12 items-center gap-3 overflow-hidden rounded-2xl px-1.5 text-sm font-medium text-slate-600 outline-none transition-[width,background-color,color] hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-2 focus-visible:ring-primary-300 ${
            expanded ? 'w-full' : 'w-12'
          }`}
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <AppGlyph name="logout" size="sm" />
          </span>
          <span className={labelClass} aria-hidden={!expanded}>
            Cerrar sesión
          </span>
        </button>
      </div>
    </div>
  );
}

function DesktopSection({
  title,
  items,
  pathname,
  expanded,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  expanded: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, [pathname]);

  return (
    <div className="mb-5">
      <div className="relative flex h-7 items-center px-1.5">
        <span
          className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition-opacity ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden={!expanded}
        >
          {title}
        </span>
        <span
          className={`absolute ml-2 h-px w-5 bg-slate-200 transition-opacity ${
            expanded ? 'opacity-0' : 'opacity-100'
          }`}
          aria-hidden="true"
        />
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const theme = getModuleTheme(item.theme);
          const testId = `desktop-nav-${item.href.replace(/^\//, '').replaceAll('/', '-')}`;

          return (
            <button
              key={item.href}
              type="button"
              data-testid={testId}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              title={expanded ? undefined : item.label}
              onClick={() => {
                if (item.href === pathname) {
                  onNavigate();
                  return;
                }

                router.push(item.href);
                onNavigate();

                if (fallbackTimerRef.current !== null) {
                  window.clearTimeout(fallbackTimerRef.current);
                }

                fallbackTimerRef.current = window.setTimeout(() => {
                  if (window.location.pathname !== item.href) {
                    window.location.assign(item.href);
                  }
                }, 4000);
              }}
              style={moduleThemeToStyle(theme)}
              className={`flex h-12 items-center gap-3 overflow-hidden rounded-2xl px-1 text-left text-sm font-medium outline-none transition-[width,background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-[var(--module-border)] ${
                expanded ? 'w-full' : 'w-12'
              } ${
                isActive
                  ? 'bg-[var(--module-soft-bg)] text-[var(--module-text)] shadow-[inset_0_0_0_1px_var(--module-border)]'
                  : 'text-slate-600 hover:bg-surface-subtle hover:text-slate-950'
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  isActive
                    ? 'bg-white/70 text-[var(--module-text)] shadow-sm'
                    : 'bg-[var(--module-soft-bg)] text-[var(--module-primary)]'
                }`}
              >
                <NavIcon name={item.icon} />
              </span>
              <span
                className={`min-w-0 whitespace-nowrap transition-[opacity,transform] duration-150 ${
                  expanded
                    ? 'translate-x-0 opacity-100'
                    : 'pointer-events-none translate-x-1 opacity-0'
                }`}
                aria-hidden={!expanded}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SidebarContent({
  actor,
  pathname,
  onLogout,
  primaryItems,
  adminItems,
  onNavigate,
  mobile = false,
}: {
  actor: ActorActual;
  pathname: string;
  onLogout: () => Promise<void>;
  primaryItems: NavItem[];
  adminItems: NavItem[];
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const router = useRouter();
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, [pathname]);

  const safeNavigate = (href: string) => {
    if (href === pathname) {
      onNavigate?.();
      return;
    }

    // Try SPA navigation first; if it doesn't complete, fallback to hard navigation.
    router.push(href);
    onNavigate?.();

    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
    }

    fallbackTimerRef.current = window.setTimeout(() => {
      if (window.location.pathname !== href) {
        window.location.assign(href);
      }
    }, 4000);
  };

  const initials = actor.nombreCompleto
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-6 py-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => safeNavigate('/dashboard')}
            className="block min-w-0 flex-1 text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-700">
              Beteele One
            </p>
            <div className="mt-2 min-w-0">
              <h1 className="font-heading text-lg font-semibold text-slate-950">ISDIN</h1>
              <p className="mt-1 truncate text-xs text-slate-500">Operacion central</p>
            </div>
          </button>
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

      <nav className={`flex-1 overflow-y-auto px-4 py-6 ${mobile ? 'pb-28' : ''}`}>
        {primaryItems.length > 0 && (
          <Section
            title="Modulos"
            items={primaryItems}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        )}
        {adminItems.length > 0 && (
          <Section title="Gestion" items={adminItems} pathname={pathname} onNavigate={onNavigate} />
        )}
      </nav>

      <div
        className={`border-t border-border/70 bg-white p-4 ${
          mobile
            ? 'sticky bottom-0 z-10 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-[0_-12px_30px_rgba(15,23,42,0.08)]'
            : ''
        }`}
      >
        <button
          onClick={() => void onLogout()}
          className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-primary-200 hover:bg-primary-50"
        >
          <AppGlyph name="logout" size="sm" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, [pathname]);

  return (
    <div className="mb-8">
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <div className="mt-3 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const theme = getModuleTheme(item.theme);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => {
                if (item.href === pathname) {
                  onNavigate?.();
                  return;
                }

                router.push(item.href);
                onNavigate?.();

                if (fallbackTimerRef.current !== null) {
                  window.clearTimeout(fallbackTimerRef.current);
                }

                fallbackTimerRef.current = window.setTimeout(() => {
                  if (window.location.pathname !== item.href) {
                    window.location.assign(item.href);
                  }
                }, 4000);
              }}
              style={moduleThemeToStyle(theme)}
              className={`flex w-full items-center gap-3 rounded-[16px] px-3.5 py-3 text-left text-sm font-medium transition ${
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
