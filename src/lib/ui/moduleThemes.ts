import type { CSSProperties } from 'react'

export type ModuleThemeKey =
  | 'dashboard'
  | 'pdvs'
  | 'empleados'
  | 'nomina'
  | 'asignaciones'
  | 'campanas'
  | 'materiales'
  | 'gastos'
  | 'formaciones'
  | 'ruta-semanal'
  | 'asistencias'
  | 'solicitudes'
  | 'reportes'
  | 'mensajes'
  | 'perfil'
  | 'configuracion'
  | 'reglas'
  | 'bitacora'
  | 'usuarios'
  | 'ranking'
  | 'ventas'
  | 'love-isdin'
  | 'clientes'
  | 'offline'
  | 'default'

export interface ModuleTheme {
  key: ModuleThemeKey
  primary: string
  hover: string
  softBg: string
  border: string
  shadow: string
  text: string
}

const moduleBaseColors: Record<ModuleThemeKey, string> = {
  dashboard: '#8F9BFF',
  pdvs: '#6FD6FF',
  empleados: '#6EE7C8',
  nomina: '#6FE3B3',
  asignaciones: '#6FA8FF',
  campanas: '#FF9B7A',
  materiales: '#A9B7C9',
  gastos: '#C7A6FF',
  formaciones: '#FFD36E',
  'ruta-semanal': '#63E0D4',
  asistencias: '#7EE6A8',
  solicitudes: '#FFC97A',
  reportes: '#A5B8FF',
  mensajes: '#73D8FF',
  perfil: '#9AA6B2',
  configuracion: '#A3A8B3',
  reglas: '#D0D9FF',
  bitacora: '#7C8DFF',
  usuarios: '#FF9BD1',
  ranking: '#FFD76F',
  ventas: '#7EEFAE',
  'love-isdin': '#FF7FA5',
  clientes: '#9AA6B2',
  offline: '#A3A8B3',
  default: '#2CB67D',
}

function normalizeHex(hex: string) {
  const value = hex.trim().replace('#', '')
  if (value.length === 3) {
    return value
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
  }

  return value
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex)
  const value = Number.parseInt(normalized, 16)

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function darken(hex: string, percentage: number) {
  const { r, g, b } = hexToRgb(hex)
  const factor = 1 - percentage

  return `#${[r, g, b]
    .map((channel) => clampChannel(channel * factor).toString(16).padStart(2, '0'))
    .join('')}`
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getModuleTheme(key: ModuleThemeKey): ModuleTheme {
  const primary = moduleBaseColors[key] ?? moduleBaseColors.default

  return {
    key,
    primary,
    hover: darken(primary, 0.08),
    softBg: rgba(primary, 0.08),
    border: rgba(primary, 0.18),
    shadow: rgba(primary, 0.08),
    text: darken(primary, 0.32),
  }
}

export function resolveModuleThemeKey(pathname: string): ModuleThemeKey {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/pdvs')) return 'pdvs'
  if (pathname.startsWith('/empleados')) return 'empleados'
  if (pathname.startsWith('/nomina') || pathname.startsWith('/mi-nomina')) return 'nomina'
  if (pathname.startsWith('/asignaciones')) return 'asignaciones'
  if (pathname.startsWith('/campanas')) return 'campanas'
  if (pathname.startsWith('/materiales')) return 'materiales'
  if (pathname.startsWith('/gastos')) return 'gastos'
  if (pathname.startsWith('/formaciones')) return 'formaciones'
  if (pathname.startsWith('/ruta-semanal')) return 'ruta-semanal'
  if (pathname.startsWith('/asistencias')) return 'asistencias'
  if (pathname.startsWith('/solicitudes')) return 'solicitudes'
  if (pathname.startsWith('/reportes')) return 'reportes'
  if (pathname.startsWith('/mensajes')) return 'mensajes'
  if (pathname.startsWith('/configuracion')) return 'configuracion'
  if (pathname.startsWith('/reglas')) return 'reglas'
  if (pathname.startsWith('/bitacora')) return 'bitacora'
  if (pathname.startsWith('/admin/users')) return 'usuarios'
  if (pathname.startsWith('/ranking')) return 'ranking'
  if (pathname.startsWith('/ranking-publico')) return 'ranking'
  if (pathname.startsWith('/ventas')) return 'ventas'
  if (pathname.startsWith('/love-isdin')) return 'love-isdin'
  if (pathname.startsWith('/clientes')) return 'clientes'
  if (pathname.startsWith('/offline')) return 'offline'
  return 'default'
}

export function moduleThemeToStyle(theme: ModuleTheme): CSSProperties {
  return {
    '--module-primary': theme.primary,
    '--module-hover': theme.hover,
    '--module-soft-bg': theme.softBg,
    '--module-border': theme.border,
    '--module-shadow': theme.shadow,
    '--module-text': theme.text,
    '--module-focus-ring': rgba(theme.primary, 0.16),
  } as CSSProperties
}
