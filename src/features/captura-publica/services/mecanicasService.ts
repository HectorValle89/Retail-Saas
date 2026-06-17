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

// Mapea y normaliza las ciudades de la base de datos de acuerdo a las reglas de negocio
export function normalizarCiudad(nombre: string): string {
  const UPPER = nombre.trim().toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Quitar acentos para la comparación

  // Englobar Zona Metropolitana de la Ciudad de México
  const zmMexico = [
    'CIUDAD DE MEXICO',
    'CDMX',
    'ATIZAPAN DE ZARAGOZA',
    'NICOLAS ROMERO',
    'COYOACAN',
    'CUAJIMALPA DE MORELOS',
    'TLALNEPANTLA DE BAZ',
    'AZCAPOTZALCO',
    'ECATEPEC',
    'NAUCALPAN',
    'TLALNEPANTLA',
    'NEZAHUALCOYOTL',
    'CHIMALHUACAN',
    'TULTITLAN',
    'ATIZAPAN',
    'VALLE DE CHALCO',
    'CHALCO',
    'IZTAPALAPA',
    'GUSTAVO A. MADERO',
    'ALVARO OBREGON',
    'BENITO JUAREZ',
    'CUAUHTEMOC',
    'IZTACALCO',
    'MAGDALENA CONTRERAS',
    'MIGUEL HIDALGO',
    'MILPA ALTA',
    'TLAHUAC',
    'TLALPAN',
    'VENUSTIANO CARRANZA',
    'XOCHIMILCO',
    'NAUCALPAN DE JUAREZ',
    'COACALCO',
    'COACALCO DE BERRIOZABAL',
    'CUAUTITLAN',
    'CUAUTITLAN IZCALLI',
    'HUIXQUILUCAN',
    'LA PAZ',
    'TEXCOCO',
    'TECAMAC',
    'CHICOLOAPAN',
    'LOS REYES LA PAZ',
  ];
  if (
    zmMexico.includes(UPPER) ||
    UPPER.includes('ZONA METROPOLITANA DE MEXICO') ||
    UPPER.includes('ZONA METROPOLITANA DE LA CIUDAD DE MEXICO') ||
    UPPER.includes('CIUDAD DE MEXICO') ||
    UPPER.includes('CDMX')
  ) {
    return 'CIUDAD DE MÉXICO';
  }

  // Englobar Metepec y Toluca a TOLUCA
  if (
    UPPER === 'TOLUCA' ||
    UPPER === 'METEPEC' ||
    UPPER.includes('TOLUCA') ||
    UPPER.includes('METEPEC')
  ) {
    return 'TOLUCA';
  }

  // Englobar Guadalajara y su zona metropolitana a GUADALAJARA
  const zmGuadalajara = [
    'GUADALAJARA',
    'ZAPOPAN',
    'TLAQUEPAQUE',
    'TONALA',
    'TLAJOMULCO',
    'TLAJOMULCO DE ZUNIGA',
    'SAN PEDRO TLAQUEPAQUE',
    'EL SALTO',
    'JUANACATLAN',
    'IXTLAHUACAN DE LOS MEMBRILLOS',
  ];
  if (
    zmGuadalajara.includes(UPPER) ||
    UPPER.includes('GUADALAJARA') ||
    UPPER.includes('ZAPOPAN') ||
    UPPER.includes('TLAQUEPAQUE') ||
    UPPER.includes('TONALA') ||
    UPPER.includes('TLAJOMULCO')
  ) {
    return 'GUADALAJARA';
  }

  // Englobar Monterrey y su zona metropolitana a MONTERREY
  const zmMonterrey = [
    'MONTERREY',
    'SAN PEDRO',
    'SAN PEDRO GARZA GARCIA',
    'SAN NICOLAS',
    'SAN NICOLAS DE LOS GARZA',
    'GUADALUPE',
    'APODACA',
    'ESCOBEDO',
    'GENERAL ESCOBEDO',
    'SANTA CATARINA',
    'GARCIA',
    'JUAREZ',
    'VILLA DE JUAREZ',
    'CADEREYTA',
    'CADEREYTA JIMENEZ',
    'SANTIAGO',
    'SALINAS VICTORIA',
    'PESQUERIA',
    'EL CARMEN',
  ];
  if (
    zmMonterrey.includes(UPPER) ||
    UPPER.includes('MONTERREY') ||
    UPPER.includes('SAN PEDRO GARZA') ||
    UPPER.includes('SAN NICOLAS') ||
    UPPER.includes('APODACA') ||
    UPPER.includes('ESCOBEDO') ||
    UPPER.includes('SANTA CATARINA')
  ) {
    return 'MONTERREY';
  }

  // Retornar en mayúsculas y sin acentos para coincidir exactamente con el catálogo de base de datos
  return UPPER;
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
      const uniqueNormalized = new Set(
        dbCiudades
          .map((c) => c.nombre)
          .filter((n): n is string => Boolean(n))
          .map((n) => normalizarCiudad(n))
      );
      ciudades = Array.from(uniqueNormalized).sort((a, b) => a.localeCompare(b, 'es'));
    }

    // Si por alguna razón no hay ciudades en la base de datos, usamos un backup de plazas principales
    if (ciudades.length === 0) {
      ciudades = [
        'CIUDAD DE MÉXICO',
        'GUADALAJARA',
        'MONTERREY',
        'TOLUCA',
        'PUEBLA',
        'QUERÉTARO',
        'LEÓN',
        'MÉRIDA',
        'HERMOSILLO',
        'CULIACÁN',
        'MAZATLAN',
        'TIJUANA',
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
      // Aplicamos la misma normalización para que coincida perfectamente con el frontend
      ciudad: normalizarCiudad(r.ciudad_envio),
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
