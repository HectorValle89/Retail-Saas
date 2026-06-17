import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { obtenerCapturaPublicaLinkParaRegistro } from './capturaPublicaService';
import {
  SUPERVISORES_OFICIALES,
  PRENDAS_PERMITIDAS,
  GENEROS_PERMITIDOS,
  TALLAS_PERMITIDAS,
} from './mecanicasConstants';

type TypedSupabaseClient = ReturnType<typeof createServiceClient>;

export interface RegistroPrevioItem {
  supervisor: string;
  ciudad: string;
}

export interface MecanicasPublicasData {
  ok: boolean;
  message?: string;
  cuentaClienteId?: string;
  cuentaClienteNombre?: string;
  supervisoresOficiales: string[];
  supervisoresYaRegistrados: RegistroPrevioItem[];
  prendasPermitidas: string[];
  generosPermitidos: string[];
  tallasPermitidas: string[];
  ciudades: string[];
}

export async function obtenerMecanicasPublicasData(
  slug: string,
  service: TypedSupabaseClient = createServiceClient()
): Promise<MecanicasPublicasData> {
  try {
    const link = await obtenerCapturaPublicaLinkParaRegistro(service, slug);

    // Obtener las ciudades activas de la base de datos para el envío
    const { data: dbCiudades, error: ciudadesError } = await service
      .from('ciudad')
      .select('nombre')
      .eq('activa', true)
      .order('nombre', { ascending: true })
      .limit(200);

    let ciudades: string[] = [];
    if (!ciudadesError && dbCiudades) {
      ciudades = dbCiudades.map((c) => c.nombre).filter((n): n is string => Boolean(n));
    }

    // Si por alguna razón no hay ciudades en la base de datos, usamos un backup de plazas principales
    if (ciudades.length === 0) {
      ciudades = [
        'CDMX',
        'Guadalajara',
        'Monterrey',
        'Puebla',
        'Querétaro',
        'León',
        'Mérida',
        'Hermosillo',
        'Culiacán',
        'Mazatlán',
        'Toluca',
        'Tijuana',
        'Veracruz',
      ];
    }

    // Obtener los supervisores y ciudades que ya hicieron su registro
    const { data: registros, error } = await service
      .from('levantamiento_uniforme')
      .select('supervisor_nombre, ciudad_envio')
      .eq('cuenta_cliente_id', link.cuentaClienteId)
      .limit(1000);

    if (error) {
      throw new Error(`Error al cargar registros de uniformes: ${error.message}`);
    }

    const supervisoresYaRegistrados = (registros ?? []).map((r) => ({
      supervisor: r.supervisor_nombre,
      ciudad: r.ciudad_envio,
    }));

    return {
      ok: true,
      cuentaClienteId: link.cuentaClienteId,
      cuentaClienteNombre: link.cuentaClienteNombre,
      supervisoresOficiales: [...SUPERVISORES_OFICIALES],
      supervisoresYaRegistrados,
      prendasPermitidas: [...PRENDAS_PERMITIDAS],
      generosPermitidos: [...GENEROS_PERMITIDOS],
      tallasPermitidas: [...TALLAS_PERMITIDAS],
      ciudades,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible cargar la información de uniformes.',
      supervisoresOficiales: [...SUPERVISORES_OFICIALES],
      supervisoresYaRegistrados: [],
      prendasPermitidas: [...PRENDAS_PERMITIDAS],
      generosPermitidos: [...GENEROS_PERMITIDOS],
      tallasPermitidas: [...TALLAS_PERMITIDAS],
      ciudades: [],
    };
  }
}
