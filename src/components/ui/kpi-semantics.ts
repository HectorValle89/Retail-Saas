import type { PremiumIconName } from './premium-icons'

export type KpiSemanticTone =
  | 'module'
  | 'emerald'
  | 'rose'
  | 'sky'
  | 'amber'
  | 'slate'
  | 'violet'

export type KpiSemantic = {
  icon: PremiumIconName
  tone: Exclude<KpiSemanticTone, 'module'>
  color: string
  variant: 'outline' | 'fill'
}

type SemanticRule = {
  icon: PremiumIconName
  tone: Exclude<KpiSemanticTone, 'module'>
  color: string
  variant?: 'outline' | 'fill'
  patterns: Array<string | RegExp>
}

const SEMANTIC_RULES: SemanticRule[] = [
  { icon: 'love', tone: 'rose', color: '#EC407A', variant: 'fill', patterns: ['love equipo', 'love pendiente', 'love', 'afiliacion', 'afiliaciones', 'lealtad'] },
  { icon: 'incapacidad', tone: 'rose', color: '#FF8A65', variant: 'fill', patterns: ['incapacidad', 'incapacidades'] },
  { icon: 'vacaciones', tone: 'sky', color: '#42A5F5', variant: 'fill', patterns: ['vacaciones'] },
  { icon: 'training', tone: 'violet', color: '#AB47BC', variant: 'fill', patterns: ['formacion', 'formaciones', 'isdinizacion', 'participantes conf', 'participantes confirmados'] },
  { icon: 'pending', tone: 'amber', color: '#FFA726', variant: 'outline', patterns: ['pendiente', 'pendientes', 'en proceso', 'recordatorios pendientes', 'sin auth', 'observada', 'observadas', 'bloqueado', 'bloqueados', 'bandeja accionable'] },
  { icon: 'alert', tone: 'amber', color: '#FFB300', variant: 'outline', patterns: ['alerta', 'alertas'] },
  { icon: 'absence', tone: 'rose', color: '#EF5350', variant: 'fill', patterns: ['falta administrativa', 'faltas administrativas', 'falta', 'faltas', 'sin llegada'] },
  { icon: 'missing-visit', tone: 'rose', color: '#EF5350', variant: 'fill', patterns: ['sin visita', 'tiendas sin visita', 'pdvs sin visita'] },
  { icon: 'geofence', tone: 'emerald', color: '#66BB6A', variant: 'fill', patterns: ['geocerca ok', 'con geocerca'] },
  { icon: 'checkin', tone: 'emerald', color: '#26A69A', variant: 'fill', patterns: ['check-ins validos', 'check ins validos', 'checkin'] },
  { icon: 'stores', tone: 'sky', color: '#5C6BC0', variant: 'fill', patterns: ['tiendas hoy', 'pdv', 'pdvs', 'tienda', 'tiendas', 'sucursal', 'total visibles'] },
  { icon: 'route', tone: 'sky', color: '#42A5F5', variant: 'fill', patterns: ['ruta', 'rutas', 'tablero de rutas', 'rutas activas', 'rutas visibles', 'ruta activa', 'visitas planeadas', 'asignadas semana'] },
  { icon: 'map', tone: 'violet', color: '#7E57C2', variant: 'outline', patterns: ['mapa operacional', 'mapa'] },
  { icon: 'sales', tone: 'emerald', color: '#26A69A', variant: 'fill', patterns: ['ventas totales', 'ventas confirmadas', 'ventas', 'confirmadas', 'confirmados', 'hechas mes', 'hechas semana'] },
  { icon: 'money', tone: 'emerald', color: '#43A047', variant: 'outline', patterns: ['monto confirmado', 'monto', 'percepciones', 'reembolsos gasto', 'reembolsados', 'ticket promedio'] },
  { icon: 'materials', tone: 'amber', color: '#FFA726', variant: 'outline', patterns: ['unidades', 'catalogo activo', 'material', 'materiales', 'saldo'] },
  { icon: 'draft', tone: 'slate', color: '#90A4AE', variant: 'outline', patterns: ['borrador', 'borradores', 'publicada', 'publicadas'] },
  { icon: 'campaigns', tone: 'sky', color: '#42A5F5', variant: 'outline', patterns: ['campanas activas', 'campana activa', 'campana', 'campanas', 'programadas', 'terminadas', 'activas', 'broadcast'] },
  { icon: 'target', tone: 'amber', color: '#FF7043', variant: 'outline', patterns: ['pdvs objetivo', 'objetivo', 'objetivos', 'meta', 'metas', 'cuota', 'cuotas', 'ranking', 'posicion', 'cumplimiento', 'avance', 'cuotas cumplidas', 'objetivo mensual', 'pendientes mes', 'pendientes semana'] },
  { icon: 'payroll', tone: 'sky', color: '#26C6DA', variant: 'outline', patterns: ['neto nomina', 'neto estimado', 'neto', 'nomina', 'periodo', 'periodos', 'imss', 'altas imss pendientes', 'altas imss'] },
  { icon: 'employees', tone: 'sky', color: '#5C6BC0', variant: 'fill', patterns: ['colaboradoras visibles', 'colaboradores', 'empleado', 'empleados', 'usuario', 'usuarios', 'dc con meta', 'plantilla', 'supervisor', 'supervisores', 'dermoconsejera', 'dermoconsejeras'] },
  { icon: 'attendance', tone: 'emerald', color: '#66BB6A', variant: 'fill', patterns: ['asistencia', 'asistencias', 'jornadas validas', 'jornadas abiertas', 'registros totales', 'dias justificados', 'cerradas', 'completadas', 'completada', 'completadas semana', 'realizadas mes', 'realizadas semana', 'hechas mes', 'check-ins validos'] },
  { icon: 'clock', tone: 'amber', color: '#FBC02D', variant: 'outline', patterns: ['retardos / fr', 'retardos', 'fr'] },
  { icon: 'messages', tone: 'amber', color: '#FFB300', variant: 'outline', patterns: ['mensaje', 'mensajes', 'no leidos', 'no leido', 'encuesta', 'encuestas'] },
  { icon: 'requests', tone: 'violet', color: '#7E57C2', variant: 'outline', patterns: ['solicitud', 'solicitudes', 'validadas sup', 'registradas rh', 'aprobadas'] },
  { icon: 'sync', tone: 'emerald', color: '#26A69A', variant: 'outline', patterns: ['sincronizar', 'sync', 'subida', 'nube'] },
  { icon: 'offline', tone: 'slate', color: '#78909C', variant: 'outline', patterns: ['offline', 'operacion offline'] },
  { icon: 'warning', tone: 'rose', color: '#EF5350', variant: 'outline', patterns: ['fallido', 'fallidos', 'invalida', 'invalido', 'rechazada', 'rechazadas', 'fuera geocerca', 'sin asignacion', 'riesgo', 'brecha'] },
  { icon: 'clients', tone: 'sky', color: '#5C6BC0', variant: 'fill', patterns: ['cliente', 'clientes', 'cuenta', 'cuentas'] },
  { icon: 'settings', tone: 'slate', color: '#546E7A', variant: 'outline', patterns: ['configuracion', 'parametro', 'parametros', 'misiones activas', 'turnos catalogo'] },
  { icon: 'rules', tone: 'slate', color: '#546E7A', variant: 'outline', patterns: ['regla', 'reglas', 'integridad', 'severidad', 'flujo de aprobacion'] },
  { icon: 'qr', tone: 'rose', color: '#EC407A', variant: 'fill', patterns: [/\bqr\b/, 'codigo qr'] },
]

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesPattern(value: string, pattern: string | RegExp) {
  if (typeof pattern === 'string') {
    return value.includes(pattern)
  }

  return pattern.test(value)
}

export function withAlpha(color: string, alpha: number) {
  const safeAlpha = Math.max(0, Math.min(1, alpha))
  const hex = color.replace('#', '')
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex

  const numeric = Number.parseInt(normalized, 16)
  if (Number.isNaN(numeric)) {
    return color
  }

  const red = (numeric >> 16) & 255
  const green = (numeric >> 8) & 255
  const blue = numeric & 255

  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`
}

export function resolveKpiSemantic(label: string): KpiSemantic {
  const normalized = normalizeLabel(label)

  for (const rule of SEMANTIC_RULES) {
    if (rule.patterns.some((pattern) => matchesPattern(normalized, pattern))) {
      return {
        icon: rule.icon,
        tone: rule.tone,
        color: rule.color,
        variant: rule.variant ?? 'fill',
      }
    }
  }

  return { icon: 'reports', tone: 'slate', color: '#546E7A', variant: 'outline' }
}
