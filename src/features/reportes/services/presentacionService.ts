import type { SupabaseClient } from '@supabase/supabase-js';
import type { TipoEvidencia } from '@/features/evidencias/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

export interface PresentacionFiltros {
  tipoEvidencia?: TipoEvidencia | '';
  fechaInicio?: string;
  fechaFin?: string;
  pdvId?: string;
  supervisorId?: string;
  cuentaClienteId?: string;
}

export interface SupervisorEvidenciaData {
  id: string;
  fechaOperacion: string;
  tipoEvidencia: TipoEvidencia;
  fotos: any[];
  observaciones: string | null;
  metadata: Record<string, any>;
  created_at: string;
  pdv: {
    id: string;
    nombre: string;
    claveBtl: string;
    cadena: { nombre: string } | null;
  } | null;
  supervisor: {
    id: string;
    nombre_completo: string;
  };
  cuenta: {
    id: string;
    nombre: string;
  };
}

export async function obtenerSupervisorEvidenciasParaReporte(
  service: TypedSupabaseClient,
  filtros: PresentacionFiltros
): Promise<SupervisorEvidenciaData[]> {
  let query = service
    .from('supervisor_evidencia')
    .select(`
      id,
      fecha_operacion,
      tipo_evidencia,
      fotos,
      observaciones,
      metadata,
      created_at,
      pdv:pdv_id(
        id,
        nombre,
        clave_btl,
        cadena:cadena_id(nombre)
      ),
      supervisor:supervisor_empleado_id(
        id,
        nombre_completo
      ),
      cuenta:cuenta_cliente_id(
        id,
        nombre
      )
    `);

  if (filtros.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', filtros.cuentaClienteId);
  }

  if (filtros.tipoEvidencia) {
    query = query.eq('tipo_evidencia', filtros.tipoEvidencia);
  }

  if (filtros.fechaInicio && filtros.fechaFin) {
    query = query.or(`and(fecha_operacion.gte.${filtros.fechaInicio},fecha_operacion.lte.${filtros.fechaFin}),and(created_at.gte.${filtros.fechaInicio}T00:00:00Z,created_at.lte.${filtros.fechaFin}T23:59:59Z)`);
  } else if (filtros.fechaInicio) {
    query = query.gte('fecha_operacion', filtros.fechaInicio);
  } else if (filtros.fechaFin) {
    query = query.lte('fecha_operacion', filtros.fechaFin);
  }

  if (filtros.pdvId) {
    query = query.eq('pdv_id', filtros.pdvId);
  }

  if (filtros.supervisorId) {
    query = query.eq('supervisor_empleado_id', filtros.supervisorId);
  }

  // Ordenar de forma descendente por fecha de operación y creación
  query = query.order('fecha_operacion', { ascending: false }).order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error al consultar supervisor_evidencia:', error);
    throw new Error(`Fallo al recuperar registros de evidencias: ${error.message || error.details || error.code}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    fechaOperacion: row.fecha_operacion,
    tipoEvidencia: row.tipo_evidencia as TipoEvidencia,
    fotos: Array.isArray(row.fotos) ? row.fotos : [],
    observaciones: row.observaciones,
    metadata: row.metadata || {},
    created_at: row.created_at,
    pdv: row.pdv
      ? {
          id: row.pdv.id,
          nombre: row.pdv.nombre,
          claveBtl: row.pdv.clave_btl,
          cadena: row.pdv.cadena,
        }
      : null,
    supervisor: {
      id: row.supervisor?.id || '',
      nombre_completo: row.supervisor?.nombre_completo || 'Supervisor',
    },
    cuenta: {
      id: row.cuenta?.id || '',
      nombre: row.cuenta?.nombre || 'Cuenta',
    },
  }));
}
