import { calculateOperationalPayroll } from '../lib/payrollMath'
import type { NominaPeriodoEstado } from '../lib/periodState'
import {
  deriveAttendanceDiscipline,
  type AttendanceDisciplineAssignment,
  type AttendanceDisciplineFormation,
} from '@/features/asistencias/lib/attendanceDiscipline'
import { obtenerPanelEmpleados, type EmpleadoListadoItem } from '@/features/empleados/services/empleadoService'
import { buildPayrollInbox, type EmployeePayrollInboxData } from '@/features/empleados/lib/workflowInbox'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formacionTargetsEmployee } from '@/features/formaciones/lib/formacionTargeting'
import type {
  Asistencia,
  Asignacion,
  ConfiguracionSistema,
  CuentaCliente,
  CuotaEmpleadoPeriodo,
  Empleado,
  FormacionEvento,
  LoveIsdin,
  NominaLedger,
  PeriodoNomina,
  RutaSemanalVisita,
  Solicitud,
  Venta,
} from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre'>
type CadenaRelacion = { nombre: string | null }
type EmpleadoRelacion = Pick<Empleado, 'id_nomina' | 'nombre_completo' | 'puesto'>
type PeriodoRelacion = Pick<PeriodoNomina, 'clave' | 'estado'>

type PeriodoQueryRow = Pick<
  PeriodoNomina,
  'id' | 'clave' | 'fecha_inicio' | 'fecha_fin' | 'estado' | 'fecha_cierre' | 'observaciones' | 'metadata'
>

interface CuotaQueryRow
  extends Pick<
    CuotaEmpleadoPeriodo,
    | 'id'
    | 'periodo_id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'cadena_id'
    | 'objetivo_monto'
    | 'objetivo_unidades'
    | 'avance_monto'
    | 'avance_unidades'
    | 'factor_cuota'
    | 'cumplimiento_porcentaje'
    | 'bono_estimado'
    | 'estado'
    | 'metadata'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  cadena: MaybeMany<CadenaRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  periodo: MaybeMany<PeriodoRelacion>
}

interface LedgerQueryRow
  extends Pick<
    NominaLedger,
    | 'id'
    | 'periodo_id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'tipo_movimiento'
    | 'concepto'
    | 'referencia_tabla'
    | 'referencia_id'
    | 'monto'
    | 'moneda'
    | 'notas'
    | 'created_at'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  periodo: MaybeMany<PeriodoRelacion>
}

interface AsistenciaQueryRow
  extends Pick<Asistencia, 'id' | 'empleado_id' | 'cuenta_cliente_id' | 'empleado_nombre' | 'fecha_operacion' | 'check_in_utc' | 'check_out_utc' | 'estatus'> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

interface VentaQueryRow
  extends Pick<Venta, 'empleado_id' | 'cuenta_cliente_id' | 'total_monto' | 'total_unidades' | 'confirmada'> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

interface LoveQueryRow extends Pick<LoveIsdin, 'empleado_id' | 'cuenta_cliente_id' | 'estatus'> {}

interface RutaVisitaQueryRow
  extends Pick<RutaSemanalVisita, 'supervisor_empleado_id' | 'cuenta_cliente_id' | 'estatus' | 'completada_en'> {}

type AsignacionDisciplinaRow = Pick<
  Asignacion,
  | 'id'
  | 'empleado_id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'tipo'
  | 'dias_laborales'
  | 'dia_descanso'
  | 'horario_referencia'
  | 'estado_publicacion'
  | 'naturaleza'
  | 'prioridad'
>

type SolicitudDisciplinaRow = Pick<
  Solicitud,
  'id' | 'empleado_id' | 'fecha_inicio' | 'fecha_fin' | 'tipo' | 'estatus' | 'metadata'
>

type FormacionDisciplinaRow = Pick<
  FormacionEvento,
  'id' | 'fecha_inicio' | 'fecha_fin' | 'nombre' | 'tipo' | 'estado' | 'participantes' | 'metadata'
>

type ConfiguracionNominaRow = Pick<ConfiguracionSistema, 'clave' | 'valor'>

type EmpleadoSalaryRow = Pick<Empleado, 'id' | 'sueldo_base_mensual'>

interface PreNominaAcumulado {
  empleadoId: string
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaClienteId: string | null
  cuentaCliente: string | null
  jornadasValidadas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  ventasPendientes: number
  montoConfirmado: number
  montoPendiente: number
  unidadesConfirmadas: number
  objetivoMonto: number
  objetivoUnidades: number
  cumplimiento: number
  cuotaEstado: string | null
  bonoEstimado: number
  retardos: number
  faltas: number
  ausenciasJustificadas: number
  faltasAdministrativas: number
  sueldoBaseDiario: number
  sueldoBaseDevengado: number
  comisionVentas: number
  bonoCuotaAplicado: number
  deduccionFaltas: number
  deduccionRetardos: number
  deduccionImss: number
  deduccionIsr: number
  percepciones: number
  deducciones: number
  ajustes: number
}

export interface NominaResumen {
  periodos: number
  periodoAbierto: string | null
  colaboradores: number
  percepciones: number
  deducciones: number
  netoEstimado: number
  cuotasCumplidas: number
  reembolsosGastos: number
}

export interface NominaPeriodoItem {
  id: string
  clave: string
  fechaInicio: string
  fechaFin: string
  estado: NominaPeriodoEstado
  fechaCierre: string | null
  observaciones: string | null
  empleadosIncluidos: number
  cuotas: number
  movimientosLedger: number
}

export interface PreNominaItem {
  empleadoId: string
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaClienteId: string | null
  cuentaCliente: string | null
  jornadasValidadas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  ventasPendientes: number
  montoConfirmado: number
  montoPendiente: number
  unidadesConfirmadas: number
  objetivoMonto: number
  objetivoUnidades: number
  cumplimiento: number
  cuotaEstado: string | null
  bonoEstimado: number
  retardos: number
  faltas: number
  ausenciasJustificadas: number
  faltasAdministrativas: number
  percepciones: number
  deducciones: number
  ajustes: number
  netoEstimado: number
}

export interface CuotaListadoItem {
  id: string
  periodoId: string
  periodoClave: string | null
  periodoEstado: string | null
  cuentaCliente: string | null
  cadena: string | null
  empleado: string
  idNomina: string | null
  puesto: string | null
  objetivoMonto: number
  objetivoUnidades: number
  avanceMonto: number
  avanceUnidades: number
  factorCuota: number
  cumplimiento: number
  bonoEstimado: number
  semaforo: 'ROJO' | 'AMARILLO' | 'VERDE'
  loveObjetivo: number
  loveAvance: number
  visitasObjetivo: number
  visitasAvance: number
  estado: 'EN_CURSO' | 'CUMPLIDA' | 'RIESGO'
}

export interface LedgerListadoItem {
  id: string
  periodoId: string
  periodoClave: string | null
  periodoEstado: string | null
  cuentaCliente: string | null
  empleado: string
  idNomina: string | null
  puesto: string | null
  tipoMovimiento: 'PERCEPCION' | 'DEDUCCION' | 'AJUSTE'
  concepto: string
  referenciaTabla: string | null
  referenciaId: string | null
  monto: number
  moneda: string
  notas: string | null
  createdAt: string
}

export interface NominaPanelData {
  resumen: NominaResumen
  payrollInbox: EmployeePayrollInboxData<EmpleadoListadoItem>
  payrollEmployees: EmpleadoListadoItem[]
  periodos: NominaPeriodoItem[]
  preNomina: PreNominaItem[]
  cuotas: CuotaListadoItem[]
  ledger: LedgerListadoItem[]
  periodoActivoId: string | null
  periodoExportableClave: string | null
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function getCompositeKey(empleadoId: string, cuentaClienteId: string | null) {
  return `${empleadoId}::${cuentaClienteId ?? 'sin-cuenta'}`
}

function obtenerMetadataNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 0
  }

  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0
}

function normalizeConfigNumber(rows: ConfiguracionNominaRow[], key: string, fallback: number) {
  const match = rows.find((item) => item.clave === key)
  if (!match) {
    return fallback
  }

  const raw = match.valor
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeMetadataNumber(metadata: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!metadata) {
    return 0
  }

  for (const key of keys) {
    const value = metadata[key]
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }

  return 0
}

function resolveQuotaTrafficLight(cumplimiento: number): CuotaListadoItem['semaforo'] {
  if (cumplimiento >= 100) {
    return 'VERDE'
  }

  if (cumplimiento >= 70) {
    return 'AMARILLO'
  }

  return 'ROJO'
}

function obtenerAcumulado(
  acumulados: Map<string, PreNominaAcumulado>,
  empleadoId: string,
  cuentaClienteId: string | null,
  defaults: {
    empleado?: string | null
    idNomina?: string | null
    puesto?: string | null
    cuentaCliente?: string | null
  }
) {
  const key = getCompositeKey(empleadoId, cuentaClienteId)
  const actual = acumulados.get(key) ?? {
    empleadoId,
    empleado: defaults.empleado ?? 'Sin empleado',
    idNomina: defaults.idNomina ?? null,
    puesto: defaults.puesto ?? null,
    cuentaClienteId,
    cuentaCliente: defaults.cuentaCliente ?? null,
    jornadasValidadas: 0,
    jornadasPendientes: 0,
    ventasConfirmadas: 0,
    ventasPendientes: 0,
    montoConfirmado: 0,
    montoPendiente: 0,
    unidadesConfirmadas: 0,
    objetivoMonto: 0,
    objetivoUnidades: 0,
    cumplimiento: 0,
    cuotaEstado: null,
    bonoEstimado: 0,
    retardos: 0,
    faltas: 0,
    ausenciasJustificadas: 0,
    faltasAdministrativas: 0,
    sueldoBaseDiario: 0,
    sueldoBaseDevengado: 0,
    comisionVentas: 0,
    bonoCuotaAplicado: 0,
    deduccionFaltas: 0,
    deduccionRetardos: 0,
    deduccionImss: 0,
    deduccionIsr: 0,
    percepciones: 0,
    deducciones: 0,
    ajustes: 0,
  }

  if (!actual.empleado && defaults.empleado) {
    actual.empleado = defaults.empleado
  }

  if (!actual.idNomina && defaults.idNomina) {
    actual.idNomina = defaults.idNomina
  }

  if (!actual.puesto && defaults.puesto) {
    actual.puesto = defaults.puesto
  }

  if (!actual.cuentaCliente && defaults.cuentaCliente) {
    actual.cuentaCliente = defaults.cuentaCliente
  }

  acumulados.set(key, actual)
  return actual
}

export async function obtenerPanelNomina(
  supabase: SupabaseClient
): Promise<NominaPanelData> {
  const [periodosResult, cuotasResult, ledgerResult, empleadosPanel] = await Promise.all([
    supabase
      .from('nomina_periodo')
      .select('id, clave, fecha_inicio, fecha_fin, estado, fecha_cierre, observaciones, metadata')
      .order('fecha_inicio', { ascending: false })
      .limit(12),
    supabase
      .from('cuota_empleado_periodo')
      .select(`
        id,
        periodo_id,
        cuenta_cliente_id,
        empleado_id,
        cadena_id,
        objetivo_monto,
        objetivo_unidades,
        avance_monto,
        avance_unidades,
        factor_cuota,
        cumplimiento_porcentaje,
        bono_estimado,
        estado,
        metadata,
        cuenta_cliente:cuenta_cliente_id(nombre),
        cadena:cadena_id(nombre),
        empleado:empleado_id(id_nomina, nombre_completo, puesto),
        periodo:periodo_id(clave, estado)
      `)
      .order('created_at', { ascending: false })
      .limit(48),
    supabase
      .from('nomina_ledger')
      .select(`
        id,
        periodo_id,
        cuenta_cliente_id,
        empleado_id,
        tipo_movimiento,
        concepto,
        referencia_tabla,
        referencia_id,
        monto,
        moneda,
        notas,
        created_at,
        cuenta_cliente:cuenta_cliente_id(nombre),
        empleado:empleado_id(id_nomina, nombre_completo, puesto),
        periodo:periodo_id(clave, estado)
      `)
      .order('created_at', { ascending: false })
      .limit(64),
    obtenerPanelEmpleados(supabase),
  ])

  if (periodosResult.error || cuotasResult.error || ledgerResult.error) {
    return {
      resumen: {
        periodos: 0,
        periodoAbierto: null,
        colaboradores: 0,
        percepciones: 0,
        deducciones: 0,
        netoEstimado: 0,
        cuotasCumplidas: 0,
        reembolsosGastos: 0,
      },
      payrollInbox: [],
      payrollEmployees: [],
      periodos: [],
      preNomina: [],
      cuotas: [],
      ledger: [],
      periodoActivoId: null,
      periodoExportableClave: null,
      infraestructuraLista: false,
      mensajeInfraestructura:
        periodosResult.error?.message ??
        cuotasResult.error?.message ??
        ledgerResult.error?.message ??
        'Las tablas de nomina aun no estan disponibles en Supabase.',
    }
  }

  const periodos = (periodosResult.data ?? []) as PeriodoQueryRow[]
  const cuotasRows = (cuotasResult.data ?? []) as unknown as CuotaQueryRow[]
  const ledgerRows = (ledgerResult.data ?? []) as unknown as LedgerQueryRow[]
  const periodoActivo = periodos.find((item) => item.estado === 'BORRADOR') ?? periodos[0] ?? null

  const acumulados = new Map<string, PreNominaAcumulado>()

  for (const cuota of cuotasRows) {
    const empleado = obtenerPrimero(cuota.empleado)
    const cuentaCliente = obtenerPrimero(cuota.cuenta_cliente)
    const acumulado = obtenerAcumulado(acumulados, cuota.empleado_id, cuota.cuenta_cliente_id, {
      empleado: empleado?.nombre_completo,
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente: cuentaCliente?.nombre ?? null,
    })

    acumulado.objetivoMonto = cuota.objetivo_monto
    acumulado.objetivoUnidades = cuota.objetivo_unidades
    acumulado.cumplimiento = cuota.cumplimiento_porcentaje
    acumulado.cuotaEstado = cuota.estado
    acumulado.bonoEstimado = cuota.bono_estimado
  }

  for (const movimiento of ledgerRows) {
    const empleado = obtenerPrimero(movimiento.empleado)
    const cuentaCliente = obtenerPrimero(movimiento.cuenta_cliente)
    const acumulado = obtenerAcumulado(
      acumulados,
      movimiento.empleado_id,
      movimiento.cuenta_cliente_id,
      {
        empleado: empleado?.nombre_completo,
        idNomina: empleado?.id_nomina ?? null,
        puesto: empleado?.puesto ?? null,
        cuentaCliente: cuentaCliente?.nombre ?? null,
      }
    )

    if (movimiento.tipo_movimiento === 'PERCEPCION') {
      acumulado.percepciones += movimiento.monto
    } else if (movimiento.tipo_movimiento === 'DEDUCCION') {
      acumulado.deducciones += movimiento.monto
    } else {
      acumulado.ajustes += movimiento.monto
    }
  }

  const lovePorEmpleado = new Map<string, number>()
  const visitasPorEmpleado = new Map<string, number>()

  if (periodoActivo) {
    const [asistenciasResult, ventasResult, loveResult, visitasResult, configuracionResult] = await Promise.all([
      supabase
        .from('asistencia')
        .select(`
          id,
          empleado_id,
          cuenta_cliente_id,
          empleado_nombre,
          fecha_operacion,
          check_in_utc,
          check_out_utc,
          estatus,
          cuenta_cliente:cuenta_cliente_id(nombre)
        `)
        .gte('fecha_operacion', periodoActivo.fecha_inicio)
        .lte('fecha_operacion', periodoActivo.fecha_fin),
      supabase
        .from('venta')
        .select(`
          empleado_id,
          cuenta_cliente_id,
          total_monto,
          total_unidades,
          confirmada,
          cuenta_cliente:cuenta_cliente_id(nombre)
        `)
        .gte('fecha_utc', `${periodoActivo.fecha_inicio}T00:00:00Z`)
        .lte('fecha_utc', `${periodoActivo.fecha_fin}T23:59:59Z`),
      supabase
        .from('love_isdin')
        .select('empleado_id, cuenta_cliente_id, estatus')
        .gte('fecha_utc', `${periodoActivo.fecha_inicio}T00:00:00Z`)
        .lte('fecha_utc', `${periodoActivo.fecha_fin}T23:59:59Z`),
      supabase
        .from('ruta_semanal_visita')
        .select('supervisor_empleado_id, cuenta_cliente_id, estatus, completada_en')
        .eq('estatus', 'COMPLETADA')
        .gte('completada_en', `${periodoActivo.fecha_inicio}T00:00:00Z`)
        .lte('completada_en', `${periodoActivo.fecha_fin}T23:59:59Z`),
      supabase
        .from('configuracion')
        .select('clave, valor')
        .in('clave', [
          'asistencias.tolerancia_checkin_minutos',
          'nomina.bono_cumplimiento_pct',
          'nomina.deduccion_falta_dias',
          'nomina.deduccion_retardo_pct',
          'nomina.imss_pct',
          'nomina.isr_pct',
        ]),
    ])

    if (asistenciasResult.error || ventasResult.error || loveResult.error || visitasResult.error || configuracionResult.error) {
      return {
        resumen: {
          periodos: 0,
          periodoAbierto: null,
          colaboradores: 0,
          percepciones: 0,
          deducciones: 0,
          netoEstimado: 0,
          cuotasCumplidas: 0,
          reembolsosGastos: 0,
        },
        payrollInbox: [],
        payrollEmployees: [],
        periodos: [],
        preNomina: [],
        cuotas: [],
        ledger: [],
        periodoActivoId: null,
        periodoExportableClave: null,
        infraestructuraLista: false,
        mensajeInfraestructura:
          asistenciasResult.error?.message ??
          ventasResult.error?.message ??
          loveResult.error?.message ??
          visitasResult.error?.message ??
          configuracionResult.error?.message ??
          'No fue posible calcular la prenomina operativa.',
      }
    }

    const asistencias = (asistenciasResult.data ?? []) as unknown as AsistenciaQueryRow[]
    const ventas = (ventasResult.data ?? []) as unknown as VentaQueryRow[]
    const love = (loveResult.data ?? []) as LoveQueryRow[]
    const visitas = (visitasResult.data ?? []) as RutaVisitaQueryRow[]
    const configuraciones = (configuracionResult.data ?? []) as ConfiguracionNominaRow[]

    for (const asistencia of asistencias) {
      const cuentaCliente = obtenerPrimero(asistencia.cuenta_cliente)
      const acumulado = obtenerAcumulado(
        acumulados,
        asistencia.empleado_id,
        asistencia.cuenta_cliente_id,
        {
          empleado: asistencia.empleado_nombre,
          cuentaCliente: cuentaCliente?.nombre ?? null,
        }
      )

      if (asistencia.estatus === 'VALIDA' || asistencia.estatus === 'CERRADA') {
        acumulado.jornadasValidadas += 1
      } else if (asistencia.estatus === 'PENDIENTE_VALIDACION') {
        acumulado.jornadasPendientes += 1
      }
    }

    for (const venta of ventas) {
      const cuentaCliente = obtenerPrimero(venta.cuenta_cliente)
      const acumulado = obtenerAcumulado(acumulados, venta.empleado_id, venta.cuenta_cliente_id, {
        cuentaCliente: cuentaCliente?.nombre ?? null,
      })

      if (venta.confirmada) {
        acumulado.ventasConfirmadas += 1
        acumulado.montoConfirmado += venta.total_monto
        acumulado.unidadesConfirmadas += venta.total_unidades
      } else {
        acumulado.ventasPendientes += 1
        acumulado.montoPendiente += venta.total_monto
      }
    }

    for (const item of love) {
      const key = getCompositeKey(item.empleado_id, item.cuenta_cliente_id)
      lovePorEmpleado.set(key, (lovePorEmpleado.get(key) ?? 0) + 1)
    }

    for (const item of visitas) {
      const key = getCompositeKey(item.supervisor_empleado_id, item.cuenta_cliente_id)
      visitasPorEmpleado.set(key, (visitasPorEmpleado.get(key) ?? 0) + 1)
    }

    const empleadoIds = Array.from(new Set(Array.from(acumulados.values()).map((item) => item.empleadoId)))

    if (empleadoIds.length > 0) {
      const [salariosResult, asignacionesResult, solicitudesResult, formacionesResult] = await Promise.all([
        supabase.from('empleado').select('id, sueldo_base_mensual').in('id', empleadoIds),
        supabase
          .from('asignacion')
          .select(`
            id,
            empleado_id,
            cuenta_cliente_id,
            supervisor_empleado_id,
            pdv_id,
            fecha_inicio,
            fecha_fin,
            tipo,
            dias_laborales,
            dia_descanso,
            horario_referencia,
            estado_publicacion,
            naturaleza,
            prioridad
          `)
          .in('empleado_id', empleadoIds)
          .lte('fecha_inicio', periodoActivo.fecha_fin),
        supabase
          .from('solicitud')
          .select('id, empleado_id, fecha_inicio, fecha_fin, tipo, estatus, metadata')
          .in('empleado_id', empleadoIds)
          .lte('fecha_inicio', periodoActivo.fecha_fin),
        supabase
          .from('formacion_evento')
          .select('id, fecha_inicio, fecha_fin, nombre, tipo, estado, participantes, metadata')
          .limit(200),
      ])

      if (salariosResult.error || asignacionesResult.error || solicitudesResult.error || formacionesResult.error) {
        return {
          resumen: {
            periodos: 0,
            periodoAbierto: null,
            colaboradores: 0,
            percepciones: 0,
            deducciones: 0,
            netoEstimado: 0,
            cuotasCumplidas: 0,
            reembolsosGastos: 0,
          },
          payrollInbox: [],
          payrollEmployees: [],
          periodos: [],
          preNomina: [],
          cuotas: [],
          ledger: [],
          periodoActivoId: null,
          periodoExportableClave: null,
          infraestructuraLista: false,
          mensajeInfraestructura:
            salariosResult.error?.message ??
            asignacionesResult.error?.message ??
            solicitudesResult.error?.message ??
            formacionesResult.error?.message ??
            'No fue posible consolidar reglas de nomina para el periodo activo.',
        }
      }

      const salarios = (salariosResult.data ?? []) as EmpleadoSalaryRow[]
      const asignaciones = ((asignacionesResult.data ?? []) as AsignacionDisciplinaRow[])
        .filter((item) => item.estado_publicacion === 'PUBLICADA')
        .map((item) => ({
          id: item.id,
          empleadoId: item.empleado_id,
          pdvId: item.pdv_id,
          cuentaClienteId: item.cuenta_cliente_id,
          supervisorEmpleadoId: item.supervisor_empleado_id,
          fechaInicio: item.fecha_inicio,
          fechaFin: item.fecha_fin,
          tipo: item.tipo,
          diasLaborales: item.dias_laborales,
          diaDescanso: item.dia_descanso,
          horarioReferencia: item.horario_referencia,
          naturaleza: item.naturaleza,
          prioridad: item.prioridad,
        })) satisfies AttendanceDisciplineAssignment[]
      const solicitudes = ((solicitudesResult.data ?? []) as SolicitudDisciplinaRow[])
        .filter((item) => item.fecha_fin >= periodoActivo.fecha_inicio)
        .map((item) => ({
          id: item.id,
          empleadoId: item.empleado_id,
          fechaInicio: item.fecha_inicio,
          fechaFin: item.fecha_fin,
          tipo: item.tipo,
          estatus: item.estatus,
          metadata: item.metadata,
        }))

      const formaciones = Array.from(
        new Map(
          ((formacionesResult.data ?? []) as FormacionDisciplinaRow[]).flatMap((item) =>
            ((asignacionesResult.data ?? []) as AsignacionDisciplinaRow[])
              .filter((assignment) =>
                formacionTargetsEmployee(
                  {
                    participantes: item.participantes,
                    metadata: item.metadata,
                  },
                  {
                    empleadoId: assignment.empleado_id,
                    puesto: null,
                    pdvId: assignment.pdv_id,
                  }
                )
              )
              .map((assignment) => [
                item.id + '::' + assignment.empleado_id,
                {
                  id: item.id,
                  empleadoId: assignment.empleado_id,
                  fechaInicio: item.fecha_inicio,
                  fechaFin: item.fecha_fin,
                  nombre: item.nombre ?? null,
                  tipo: item.tipo,
                  estatus: item.estado,
                } satisfies AttendanceDisciplineFormation,
              ] as const)
          )
        ).values()
      )

      const disciplina = deriveAttendanceDiscipline({
        assignments: asignaciones,
        attendances: asistencias.map((item) => ({
          id: item.id,
          empleadoId: item.empleado_id,
          cuentaClienteId: item.cuenta_cliente_id,
          fechaOperacion: item.fecha_operacion,
          checkInUtc: item.check_in_utc,
          checkOutUtc: item.check_out_utc,
          estatus: item.estatus,
        })),
        solicitudes,
        formaciones,
        toleranceMinutes: normalizeConfigNumber(configuraciones, 'asistencias.tolerancia_checkin_minutos', 15),
        payrollDeductionDays: normalizeConfigNumber(configuraciones, 'nomina.deduccion_falta_dias', 1),
        salaries: salarios.map((item) => ({
          empleadoId: item.id,
          sueldoBaseMensual: item.sueldo_base_mensual,
        })),
        periodStart: periodoActivo.fecha_inicio,
        periodEnd: periodoActivo.fecha_fin,
      })

      const disciplinaPorEmpleado = new Map(
        disciplina.summaries.map((item) => [getCompositeKey(item.empleadoId, item.cuentaClienteId), item] as const)
      )
      const salarioPorEmpleado = new Map(salarios.map((item) => [item.id, item.sueldo_base_mensual ?? 0] as const))
      const bonoCumplimientoPct = normalizeConfigNumber(configuraciones, 'nomina.bono_cumplimiento_pct', 10)
      const deduccionRetardoPct = normalizeConfigNumber(configuraciones, 'nomina.deduccion_retardo_pct', 10)
      const imssPct = normalizeConfigNumber(configuraciones, 'nomina.imss_pct', 2.5)
      const isrPct = normalizeConfigNumber(configuraciones, 'nomina.isr_pct', 10)

      for (const item of acumulados.values()) {
        const disciplinaResumen = disciplinaPorEmpleado.get(getCompositeKey(item.empleadoId, item.cuentaClienteId))

        item.retardos = disciplinaResumen?.retardos ?? 0
        item.faltas = disciplinaResumen?.faltas ?? 0
        item.ausenciasJustificadas = disciplinaResumen?.ausenciasJustificadas ?? 0
        item.faltasAdministrativas = disciplinaResumen?.faltasAdministrativas ?? 0

        const formula = calculateOperationalPayroll({
          sueldoBaseMensual: salarioPorEmpleado.get(item.empleadoId) ?? 0,
          jornadasValidadas: item.jornadasValidadas,
          montoConfirmado: item.montoConfirmado,
          aplicaBonoCumplimiento: item.cuotaEstado === 'CUMPLIDA' || item.cumplimiento >= 100,
          bonoCumplimientoPct,
          bonoCuota: item.bonoEstimado,
          retardos: item.retardos,
          deduccionFaltas: disciplinaResumen?.deduccionSugerida ?? 0,
          deduccionRetardoPct,
          imssPct,
          isrPct,
          ledgerPercepciones: item.percepciones,
          ledgerDeducciones: item.deducciones,
          ledgerAjustes: item.ajustes,
        })

        item.sueldoBaseDiario = formula.sueldoBaseDiario
        item.sueldoBaseDevengado = formula.sueldoBaseDevengado
        item.comisionVentas = formula.comisionVentas
        item.bonoCuotaAplicado = formula.bonoCuotaAplicado
        item.percepciones = formula.percepciones
        item.deduccionFaltas = formula.deduccionFaltas
        item.deduccionRetardos = formula.deduccionRetardos
        item.deduccionImss = formula.deduccionImss
        item.deduccionIsr = formula.deduccionIsr
        item.deducciones = formula.deducciones
        item.ajustes = formula.ajustes
      }
    }
  }

  const cuotas = cuotasRows.map((cuota) => {
    const empleado = obtenerPrimero(cuota.empleado)
    const cuentaCliente = obtenerPrimero(cuota.cuenta_cliente)
    const cadena = obtenerPrimero(cuota.cadena)
    const periodo = obtenerPrimero(cuota.periodo)

    return {
      id: cuota.id,
      periodoId: cuota.periodo_id,
      periodoClave: periodo?.clave ?? null,
      periodoEstado: periodo?.estado ?? null,
      cuentaCliente: cuentaCliente?.nombre ?? null,
      cadena: cadena?.nombre ?? null,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      objetivoMonto: cuota.objetivo_monto,
      objetivoUnidades: cuota.objetivo_unidades,
      avanceMonto: cuota.avance_monto,
      avanceUnidades: cuota.avance_unidades,
      factorCuota: cuota.factor_cuota,
      cumplimiento: cuota.cumplimiento_porcentaje,
      bonoEstimado: cuota.bono_estimado,
      semaforo: resolveQuotaTrafficLight(cuota.cumplimiento_porcentaje),
      loveObjetivo: normalizeMetadataNumber(cuota.metadata, 'love_objetivo_diario', 'afiliaciones_love_objetivo_diario', 'love_objetivo', 'afiliaciones_love_objetivo'),
      loveAvance: lovePorEmpleado.get(getCompositeKey(cuota.empleado_id, cuota.cuenta_cliente_id)) ?? 0,
      visitasObjetivo: normalizeMetadataNumber(cuota.metadata, 'visitas_objetivo'),
      visitasAvance: visitasPorEmpleado.get(getCompositeKey(cuota.empleado_id, cuota.cuenta_cliente_id)) ?? 0,
      estado: cuota.estado,
    }
  })

  const ledger = ledgerRows.map((movimiento) => {
    const empleado = obtenerPrimero(movimiento.empleado)
    const cuentaCliente = obtenerPrimero(movimiento.cuenta_cliente)
    const periodo = obtenerPrimero(movimiento.periodo)

    return {
      id: movimiento.id,
      periodoId: movimiento.periodo_id,
      periodoClave: periodo?.clave ?? null,
      periodoEstado: periodo?.estado ?? null,
      cuentaCliente: cuentaCliente?.nombre ?? null,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      tipoMovimiento: movimiento.tipo_movimiento,
      concepto: movimiento.concepto,
      referenciaTabla: movimiento.referencia_tabla,
      referenciaId: movimiento.referencia_id,
      monto: movimiento.monto,
      moneda: movimiento.moneda,
      notas: movimiento.notas,
      createdAt: movimiento.created_at,
    }
  })

  const cuotasPorPeriodo = cuotas.reduce<Record<string, number>>((acc, item) => {
    acc[item.periodoId] = (acc[item.periodoId] ?? 0) + 1
    return acc
  }, {})

  const ledgerPorPeriodo = ledger.reduce<Record<string, number>>((acc, item) => {
    acc[item.periodoId] = (acc[item.periodoId] ?? 0) + 1
    return acc
  }, {})

  const periodosListados = periodos.map((periodo) => ({
    id: periodo.id,
    clave: periodo.clave,
    fechaInicio: periodo.fecha_inicio,
    fechaFin: periodo.fecha_fin,
    estado: periodo.estado,
    fechaCierre: periodo.fecha_cierre,
    observaciones: periodo.observaciones,
    empleadosIncluidos: obtenerMetadataNumber(periodo.metadata, 'empleados_incluidos'),
    cuotas: cuotasPorPeriodo[periodo.id] ?? 0,
    movimientosLedger: ledgerPorPeriodo[periodo.id] ?? 0,
  }))

  const preNomina = Array.from(acumulados.values())
    .map((item) => ({
      ...item,
      netoEstimado: Number((item.percepciones + item.ajustes - item.deducciones).toFixed(2)),
    }))
    .sort((a, b) => b.netoEstimado - a.netoEstimado)

  const percepciones = preNomina.reduce((total, item) => total + item.percepciones + item.ajustes, 0)
  const deducciones = preNomina.reduce((total, item) => total + item.deducciones, 0)
  const netoEstimado = preNomina.reduce((total, item) => total + item.netoEstimado, 0)
  const reembolsosGastos = ledger.reduce((total, item) => {
    if (item.referenciaTabla === 'gasto' && item.tipoMovimiento !== 'DEDUCCION') {
      return total + item.monto
    }

    return total
  }, 0)

  return {
    resumen: {
      periodos: periodosListados.length,
      periodoAbierto: periodoActivo?.clave ?? null,
      colaboradores: preNomina.length,
      percepciones: Number(percepciones.toFixed(2)),
      deducciones: Number(deducciones.toFixed(2)),
      netoEstimado: Number(netoEstimado.toFixed(2)),
      cuotasCumplidas: cuotas.filter((item) => item.estado === 'CUMPLIDA').length,
      reembolsosGastos,
    },
    payrollInbox: buildPayrollInbox<EmpleadoListadoItem>(empleadosPanel.empleados),
    payrollEmployees: empleadosPanel.empleados,
    periodos: periodosListados,
    preNomina,
    cuotas,
    ledger,
    periodoActivoId: periodoActivo?.id ?? null,
    periodoExportableClave: periodoActivo?.clave ?? null,
    infraestructuraLista: true,
  }
}
