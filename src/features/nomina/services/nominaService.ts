import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Asistencia,
  CuentaCliente,
  CuotaEmpleadoPeriodo,
  Empleado,
  NominaLedger,
  PeriodoNomina,
  Venta,
} from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre'>
type CadenaRelacion = { nombre: string | null }
type EmpleadoRelacion = Pick<Empleado, 'id_nomina' | 'nombre_completo' | 'puesto'>
type PeriodoRelacion = Pick<PeriodoNomina, 'clave' | 'estado'>

type PeriodoQueryRow = Pick<
  PeriodoNomina,
  'id' | 'clave' | 'fecha_inicio' | 'fecha_fin' | 'estado' | 'fecha_cierre' | 'observaciones'
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
  extends Pick<Asistencia, 'empleado_id' | 'cuenta_cliente_id' | 'empleado_nombre' | 'estatus'> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

interface VentaQueryRow
  extends Pick<Venta, 'empleado_id' | 'cuenta_cliente_id' | 'total_monto' | 'total_unidades' | 'confirmada'> {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

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
}

export interface NominaPeriodoItem {
  id: string
  clave: string
  fechaInicio: string
  fechaFin: string
  estado: 'ABIERTO' | 'CERRADO'
  fechaCierre: string | null
  observaciones: string | null
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
  monto: number
  moneda: string
  notas: string | null
  createdAt: string
}

export interface NominaPanelData {
  resumen: NominaResumen
  periodos: NominaPeriodoItem[]
  preNomina: PreNominaItem[]
  cuotas: CuotaListadoItem[]
  ledger: LedgerListadoItem[]
  periodoActivoId: string | null
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
  const [periodosResult, cuotasResult, ledgerResult] = await Promise.all([
    supabase
      .from('nomina_periodo')
      .select('id, clave, fecha_inicio, fecha_fin, estado, fecha_cierre, observaciones')
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
      },
      periodos: [],
      preNomina: [],
      cuotas: [],
      ledger: [],
      periodoActivoId: null,
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
  const periodoActivo = periodos.find((item) => item.estado === 'ABIERTO') ?? periodos[0] ?? null

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

  if (periodoActivo) {
    const [asistenciasResult, ventasResult] = await Promise.all([
      supabase
        .from('asistencia')
        .select(`
          empleado_id,
          cuenta_cliente_id,
          empleado_nombre,
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
    ])

    const asistencias = (asistenciasResult.data ?? []) as unknown as AsistenciaQueryRow[]
    const ventas = (ventasResult.data ?? []) as unknown as VentaQueryRow[]

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
    cuotas: cuotasPorPeriodo[periodo.id] ?? 0,
    movimientosLedger: ledgerPorPeriodo[periodo.id] ?? 0,
  }))

  const preNomina = Array.from(acumulados.values())
    .map((item) => ({
      ...item,
      netoEstimado: item.percepciones + item.ajustes + item.bonoEstimado - item.deducciones,
    }))
    .sort((a, b) => b.netoEstimado - a.netoEstimado)

  const percepciones = preNomina.reduce((total, item) => total + item.percepciones + item.ajustes, 0)
  const deducciones = preNomina.reduce((total, item) => total + item.deducciones, 0)
  const netoEstimado = preNomina.reduce((total, item) => total + item.netoEstimado, 0)

  return {
    resumen: {
      periodos: periodosListados.length,
      periodoAbierto: periodoActivo?.clave ?? null,
      colaboradores: preNomina.length,
      percepciones,
      deducciones,
      netoEstimado,
      cuotasCumplidas: cuotas.filter((item) => item.estado === 'CUMPLIDA').length,
    },
    periodos: periodosListados,
    preNomina,
    cuotas,
    ledger,
    periodoActivoId: periodoActivo?.id ?? null,
    infraestructuraLista: true,
  }
}
