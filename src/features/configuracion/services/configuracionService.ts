import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ConfiguracionSistema,
  MisionDia,
  ReglaNegocio,
} from '@/types/database'

export interface ConfiguracionResumen {
  parametros: number
  reglasActivas: number
  misionesActivas: number
  modulosCubiertos: number
}

export interface ParametroListadoItem {
  id: string
  clave: string
  modulo: string
  descripcion: string | null
  valor: string
}

export interface ReglaListadoItem {
  id: string
  codigo: string
  modulo: string
  descripcion: string
  severidad: string
  prioridad: number
  activa: boolean
}

export interface MisionListadoItem {
  id: string
  instruccion: string
  orden: number | null
  activa: boolean
}

export interface ConfiguracionPanelData {
  resumen: ConfiguracionResumen
  parametros: ParametroListadoItem[]
  reglas: ReglaListadoItem[]
  misiones: MisionListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const serializarValor = (valor: unknown) => {
  if (valor === null || valor === undefined) {
    return 'null'
  }

  if (typeof valor === 'string') {
    return valor
  }

  return JSON.stringify(valor)
}

export async function obtenerPanelConfiguracion(
  supabase: SupabaseClient
): Promise<ConfiguracionPanelData> {
  const [
    { data: configuraciones, error: configuracionError },
    { data: reglas, error: reglasError },
    { data: misiones, error: misionesError },
  ] = await Promise.all([
    supabase
      .from('configuracion')
      .select('id, clave, valor, descripcion, modulo')
      .order('modulo', { ascending: true })
      .order('clave', { ascending: true })
      .limit(12),
    supabase
      .from('regla_negocio')
      .select('id, codigo, modulo, descripcion, severidad, prioridad, activa')
      .order('prioridad', { ascending: true })
      .limit(12),
    supabase
      .from('mision_dia')
      .select('id, instruccion, orden, activa')
      .order('orden', { ascending: true })
      .limit(20),
  ])

  if (configuracionError || reglasError || misionesError) {
    return {
      resumen: {
        parametros: 0,
        reglasActivas: 0,
        misionesActivas: 0,
        modulosCubiertos: 0,
      },
      parametros: [],
      reglas: [],
      misiones: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        configuracionError?.message ??
        reglasError?.message ??
        misionesError?.message ??
        'Las tablas de configuracion aun no estan listas en Supabase.',
    }
  }

  const parametros = ((configuraciones ?? []) as ConfiguracionSistema[]).map((item) => ({
    id: item.id,
    clave: item.clave,
    modulo: item.modulo,
    descripcion: item.descripcion,
    valor: serializarValor(item.valor),
  }))

  const reglasListadas = ((reglas ?? []) as ReglaNegocio[]).map((item) => ({
    id: item.id,
    codigo: item.codigo,
    modulo: item.modulo,
    descripcion: item.descripcion,
    severidad: item.severidad,
    prioridad: item.prioridad,
    activa: item.activa,
  }))

  const misionesListadas = ((misiones ?? []) as MisionDia[]).map((item) => ({
    id: item.id,
    instruccion: item.instruccion,
    orden: item.orden,
    activa: item.activa,
  }))

  const modulosCubiertos = new Set([
    ...parametros.map((item) => item.modulo),
    ...reglasListadas.map((item) => item.modulo),
  ]).size

  return {
    resumen: {
      parametros: parametros.length,
      reglasActivas: reglasListadas.filter((item) => item.activa).length,
      misionesActivas: misionesListadas.filter((item) => item.activa).length,
      modulosCubiertos,
    },
    parametros,
    reglas: reglasListadas,
    misiones: misionesListadas,
    infraestructuraLista: true,
  }
}
