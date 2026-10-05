'use client';

import { memo } from 'react';

export type AppGlyphName =
  | 'ventas'
  | 'canjes'
  | 'desabasto'
  | 'love'
  | 'evidencias'
  | 'dispersiones'
  | 'uniformes'
  | 'formularios'
  | 'ruta-hoy'
  | 'planeacion'
  | 'rol'
  | 'asistencia'
  | 'pdvs'
  | 'operacion-supervisores'
  | 'solicitudes'
  | 'vacaciones'
  | 'incapacidad'
  | 'cumple'
  | 'dashboard'
  | 'empleados'
  | 'reclutamiento'
  | 'campanas'
  | 'formaciones'
  | 'asignaciones'
  | 'mensajes'
  | 'nomina'
  | 'configuracion'
  | 'reportes'
  | 'logout'
  | 'clientes'
  | 'gastos'
  | 'materiales'
  | 'offline'
  | 'reglas'
  | 'usuarios'
  | 'sales'
  | 'heart'
  | 'employees'
  | 'stores'
  | 'route'
  | 'campaigns'
  | 'training'
  | 'assignments'
  | 'attendance'
  | 'requests'
  | 'payroll'
  | 'expenses'
  | 'settings'
  | 'users'
  | 'recruitment';

const GLYPH_MAP: Record<AppGlyphName, { symbol: string; label: string }> = {
  ventas: { symbol: '🛍️', label: 'Ventas' },
  canjes: { symbol: '🎁', label: 'Canjes' },
  desabasto: { symbol: '🚫', label: 'Desabastos' },
  love: { symbol: '❤️', label: 'LOVE ISDIN' },
  evidencias: { symbol: '📸', label: 'Evidencias' },
  dispersiones: { symbol: '📦', label: 'Dispersiones' },
  uniformes: { symbol: '👕', label: 'Uniformes' },
  formularios: { symbol: '📝', label: 'Formularios' },
  'ruta-hoy': { symbol: '🚗', label: 'Mi ruta de hoy' },
  planeacion: { symbol: '🗺️', label: 'Planeación mensual' },
  rol: { symbol: '🗓️', label: 'Rol mensual' },
  asistencia: { symbol: '📍', label: 'Asistencia' },
  pdvs: { symbol: '🏪', label: 'Tiendas' },
  'operacion-supervisores': { symbol: '🧭', label: 'Operación de Supervisores' },
  solicitudes: { symbol: '📑', label: 'Solicitudes' },
  vacaciones: { symbol: '🏖️', label: 'Vacaciones' },
  incapacidad: { symbol: '🩺', label: 'Incapacidades' },
  cumple: { symbol: '🎂', label: 'Día de cumpleaños' },
  dashboard: { symbol: '🏠', label: 'Inicio' },
  empleados: { symbol: '👥', label: 'Empleados' },
  reclutamiento: { symbol: '🎯', label: 'Reclutamiento' },
  campanas: { symbol: '📢', label: 'Campañas' },
  formaciones: { symbol: '🎓', label: 'Formaciones' },
  asignaciones: { symbol: '📋', label: 'Asignaciones' },
  mensajes: { symbol: '💬', label: 'Mensajes' },
  nomina: { symbol: '💳', label: 'Nómina' },
  configuracion: { symbol: '⚙️', label: 'Configuración' },
  reportes: { symbol: '📊', label: 'Reportes' },
  logout: { symbol: '🚪', label: 'Cerrar sesión' },
  clientes: { symbol: '🏢', label: 'Clientes' },
  gastos: { symbol: '🧾', label: 'Gastos' },
  materiales: { symbol: '📦', label: 'Inventarios' },
  offline: { symbol: '📶', label: 'Offline' },
  reglas: { symbol: '⚖️', label: 'Reglas' },
  usuarios: { symbol: '👤', label: 'Usuarios' },
  // Aliases
  sales: { symbol: '🛍️', label: 'Ventas' },
  heart: { symbol: '❤️', label: 'LOVE ISDIN' },
  employees: { symbol: '👥', label: 'Empleados' },
  stores: { symbol: '🏪', label: 'Tiendas' },
  route: { symbol: '🚗', label: 'Ruta' },
  campaigns: { symbol: '📢', label: 'Campañas' },
  training: { symbol: '🎓', label: 'Formaciones' },
  assignments: { symbol: '📋', label: 'Asignaciones' },
  attendance: { symbol: '📍', label: 'Asistencia' },
  requests: { symbol: '📑', label: 'Solicitudes' },
  payroll: { symbol: '💳', label: 'Nómina' },
  expenses: { symbol: '🧾', label: 'Gastos' },
  settings: { symbol: '⚙️', label: 'Configuración' },
  users: { symbol: '👤', label: 'Usuarios' },
  recruitment: { symbol: '🎯', label: 'Reclutamiento' },
};

export interface AppGlyphProps {
  name: AppGlyphName;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg sm:text-xl',
  xl: 'text-2xl',
};

export const AppGlyph = memo(function AppGlyph({
  name,
  className = '',
  size,
}: AppGlyphProps) {
  const glyph = GLYPH_MAP[name] ?? { symbol: '📌', label: name };
  const sizeClass = size ? SIZE_CLASSES[size] : '';

  return (
    <span
      role="img"
      aria-label={glyph.label}
      className={`inline-flex items-center justify-center leading-none select-none ${sizeClass} ${className}`.trim()}
    >
      {glyph.symbol}
    </span>
  );
});
