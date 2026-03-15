import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pdv } from '@/types/database'

export interface PdvResumen {
  total: number
  activos: number
  conGeocerca: number
  conSupervisor: number
}

export interface PdvListadoItem {
  id: string
  claveBtl: string
  nombre: string
  cadena: string | null
  ciudad: string | null
  radioMetros: number | null
  supervisor: string | null
  estatus: string
}

export interface PdvsPanelData {
  resumen: PdvResumen
  pdvs: PdvListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

interface RelacionNombre {
  nombre: string | null
}

interface GeocercaPdvRelacion {
  radio_tolerancia_metros: number | null
}

interface EmpleadoSupervisorRelacion {
  nombre_completo: string | null
}

interface SupervisorPdvRelacion {
  activo: boolean
  empleado: EmpleadoSupervisorRelacion[] | null
}

interface PdvQueryRow
  extends Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'estatus'> {
  cadena: RelacionNombre[] | null
  ciudad: RelacionNombre[] | null
  geocerca_pdv: GeocercaPdvRelacion[] | null
  supervisor_pdv: SupervisorPdvRelacion[] | null
}

const obtenerNombreRelacion = (relacion: RelacionNombre[] | null | undefined) =>
  relacion?.[0]?.nombre ?? null

const obtenerRadioGeocerca = (geocerca: GeocercaPdvRelacion[] | null | undefined) =>
  geocerca?.[0]?.radio_tolerancia_metros ?? null

const obtenerSupervisorActivo = (
  supervisores: SupervisorPdvRelacion[] | null | undefined
) =>
  supervisores?.find((item) => item.activo)?.empleado?.[0]?.nombre_completo ?? null

export async function obtenerPanelPdvs(
  supabase: SupabaseClient
): Promise<PdvsPanelData> {
  const { data, error } = await supabase
    .from('pdv')
    .select(`
      id,
      clave_btl,
      nombre,
      estatus,
      cadena:cadena_id(nombre),
      ciudad:ciudad_id(nombre),
      geocerca_pdv(radio_tolerancia_metros),
      supervisor_pdv(
        activo,
        empleado:empleado_id(nombre_completo)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(12)

  if (error) {
    return {
      resumen: { total: 0, activos: 0, conGeocerca: 0, conSupervisor: 0 },
      pdvs: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        'Las tablas de PDVs aun no estan disponibles o no se han migrado en Supabase.',
    }
  }

  const pdvs = ((data ?? []) as unknown as PdvQueryRow[]).map((pdv) => ({
    id: pdv.id,
    claveBtl: pdv.clave_btl,
    nombre: pdv.nombre,
    cadena: obtenerNombreRelacion(pdv.cadena),
    ciudad: obtenerNombreRelacion(pdv.ciudad),
    radioMetros: obtenerRadioGeocerca(pdv.geocerca_pdv),
    supervisor: obtenerSupervisorActivo(pdv.supervisor_pdv),
    estatus: pdv.estatus,
  }))

  return {
    resumen: {
      total: pdvs.length,
      activos: pdvs.filter((item) => item.estatus === 'ACTIVO').length,
      conGeocerca: pdvs.filter((item) => item.radioMetros !== null).length,
      conSupervisor: pdvs.filter((item) => item.supervisor !== null).length,
    },
    pdvs,
    infraestructuraLista: true,
  }
}
