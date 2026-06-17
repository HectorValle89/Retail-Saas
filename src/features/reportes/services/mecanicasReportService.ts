import { createServiceClient } from '@/lib/supabase/server';

export interface UniformePrendaItem {
  prenda: string;
  genero: string;
  talla: string;
  cantidad: number;
}

export interface LevantamientoUniformeRow {
  id: string;
  supervisor_nombre: string;
  ciudad_envio: string;
  recibe_nombre: string;
  direccion_envio: string;
  prendas: UniformePrendaItem[];
  fecha_creacion: string;
}

// Mantenemos el nombre de la función exportada para evitar romper tipos y dependencias en la compilación
export async function obtenerPropuestasMecanicas(
  cuentaClienteId: string,
  _filtros?: any
): Promise<LevantamientoUniformeRow[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('levantamiento_uniforme')
    .select('id, supervisor_nombre, ciudad_envio, recibe_nombre, direccion_envio, prendas, fecha_creacion')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .order('supervisor_nombre', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LevantamientoUniformeRow[];
}
