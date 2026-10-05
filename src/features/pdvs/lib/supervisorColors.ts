/**
 * Paleta de colores de alto contraste y asignación determinista para supervisores
 * en el mapa operacional y visualización de rutas de PDVs.
 *
 * Especialmente calibrada para los 8 supervisores de la Ciudad de México y Área Metropolitana,
 * garantizando máxima distancia cromática entre zonas colindantes.
 */

// IDs conocidos de los 8 supervisores de la Ciudad de México y Zona Metropolitana
export const CDMX_SUPERVISOR_IDS: Record<string, string> = {
  ZENAIDA: 'd70024f8-7f51-4085-a3c6-cf2ab77e5b16', // MARIA ZENAIDA MONROY GONZALEZ (Santa Fe / Interlomas / Cuajimalpa)
  XOCHITL: 'b7af5083-9fa6-4bcd-9344-c557024ad609', // XOCHITL CARRILLO XOCHIHUA (Norte / Satélite / Naucalpan)
  JACQUELINE: '6a95ae3b-2266-49b1-b67f-52f6e3e6b810', // JACQUELINE LOPEZ RUIZ (Polanco / Reforma / Chapultepec)
  MONTAGNER: '66c78f34-0e22-42dd-9f4e-7d0e461df88f', // MIGUEL ANGEL MONTAGNER OLIVARES (Roma / Condesa / Del Valle)
  ATZIN: '07c7deb5-ef5a-485b-b1e3-74d33f01f7ab', // ATZIN SUSANA AGUIRRE CAMACHO (Coyoacán / San Ángel / Tlalpan)
  JONATAN: 'd97d0708-5388-4e83-aa03-e63ce931b1dc', // JONATAN RAYMUNDO CHAVEZ RAMOS (Pedregal / Perisur / San Jerónimo)
  MIRIAM: '65032bee-b0db-4e19-b35a-89244e20f77e', // MIRIAM ROCIO ESTRADA NAVA (Oriente / Iztapalapa / Coapa)
  LILIANA: '997be0c9-7961-4e47-b221-594e4230a49a', // LILIANA REYES AYBAR (Nororiente / Lindavista / Gustavo A. Madero)
};

/**
 * Paleta especializada de alto contraste para CDMX:
 * Cada supervisor colindante tiene un matiz (hue) con separación angular de ~45°
 * y pares de alto contraste complementario.
 */
export const CDMX_SPECIAL_PALETTE: Record<string, { color: string; label: string; zona: string }> = {
  xochitl: { color: '#ea580c', label: 'Naranja Fuego', zona: 'Norte / Satélite' },
  liliana: { color: '#2563eb', label: 'Azul Rey Zafiro', zona: 'Nororiente / Lindavista' },
  jacqueline: { color: '#059669', label: 'Verde Esmeralda', zona: 'Polanco / Reforma' },
  zenaida: { color: '#9333ea', label: 'Púrpura / Morado Intenso', zona: 'Santa Fe / Interlomas' },
  montagner: { color: '#dc2626', label: 'Rojo Carmesí', zona: 'Centro / Del Valle' },
  atzin: { color: '#0891b2', label: 'Cian Océano / Turquesa', zona: 'Sur / Coyoacán' },
  jonatan: { color: '#d97706', label: 'Amarillo Ámbar Dorado', zona: 'Sur Poniente / Pedregal' },
  miriam: { color: '#db2777', label: 'Rosa Mexicano / Fucsia', zona: 'Oriente / Iztapalapa' },
};

/**
 * Paleta general para supervisores foráneos / resto de la República (Monterrey, Guadalajara, etc.)
 */
export const GENERAL_SUPERVISOR_PALETTE: readonly string[] = [
  '#84cc16', // Verde Lima Eléctrico (Ana Cristina Ánimas - Monterrey)
  '#4f46e5', // Índigo Profundo (Toluca / EdoMex)
  '#0d9488', // Teal Marino (Morelos / Cuernavaca)
  '#be123c', // Rubí Oscuro
  '#4338ca', // Azul Cobalto (Occidente / Guadalajara)
  '#ca8a04', // Mostaza Intenso
  '#047857', // Verde Selva
  '#a21caf', // Ciruela / Mora
  '#65a30d', // Verde Manzana
  '#b45309', // Bronce / Cobre
  '#0284c7', // Azul Celeste
  '#16a34a', // Verde Trébol
];

export const UNASSIGNED_SUPERVISOR_COLOR = '#64748b'; // Gris pizarra para tiendas sin supervisor

/**
 * Identifica si un supervisor pertenece a la Ciudad de México según su ID o nombre.
 */
function matchCdmxSupervisorKey(
  supervisorId: string,
  nombreCompleto?: string | null
): string | null {
  // 1. Coincidencia por ID directo
  if (supervisorId === CDMX_SUPERVISOR_IDS.XOCHITL) return 'xochitl';
  if (supervisorId === CDMX_SUPERVISOR_IDS.LILIANA) return 'liliana';
  if (supervisorId === CDMX_SUPERVISOR_IDS.JACQUELINE) return 'jacqueline';
  if (supervisorId === CDMX_SUPERVISOR_IDS.ZENAIDA) return 'zenaida';
  if (supervisorId === CDMX_SUPERVISOR_IDS.MONTAGNER) return 'montagner';
  if (supervisorId === CDMX_SUPERVISOR_IDS.ATZIN) return 'atzin';
  if (supervisorId === CDMX_SUPERVISOR_IDS.JONATAN) return 'jonatan';
  if (supervisorId === CDMX_SUPERVISOR_IDS.MIRIAM) return 'miriam';

  // 2. Coincidencia por nombre normalizado
  if (nombreCompleto) {
    const norm = nombreCompleto.toLowerCase();
    if (norm.includes('xochitl')) return 'xochitl';
    if (norm.includes('liliana')) return 'liliana';
    if (norm.includes('jacqueline')) return 'jacqueline';
    if (norm.includes('zenaida')) return 'zenaida';
    if (norm.includes('montagner')) return 'montagner';
    if (norm.includes('atzin')) return 'atzin';
    if (norm.includes('jonatan')) return 'jonatan';
    if (norm.includes('miriam')) return 'miriam';
  }

  return null;
}

/**
 * Determina si un supervisor pertenece a la Ciudad de México y Área Metropolitana.
 */
export function isCdmxSupervisor(
  supervisorId: string | null | undefined,
  nombreCompleto?: string | null
): boolean {
  if (!supervisorId) return false;
  return matchCdmxSupervisorKey(supervisorId, nombreCompleto) !== null;
}

/**
 * Obtiene los detalles de la paleta especializada de CDMX para un supervisor, si aplica.
 */
export function getCdmxSupervisorMeta(
  supervisorId: string | null | undefined,
  nombreCompleto?: string | null
): { color: string; label: string; zona: string } | null {
  if (!supervisorId) return null;
  const key = matchCdmxSupervisorKey(supervisorId, nombreCompleto);
  if (key && CDMX_SPECIAL_PALETTE[key]) {
    return CDMX_SPECIAL_PALETTE[key];
  }
  return null;
}

/**
 * Hash determinista para fallback consistente.
 */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Obtiene el color correspondiente a un supervisor.
 * Si es uno de los 8 supervisores de CDMX, devuelve su color único de alto contraste.
 * Si es foráneo, devuelve un color exclusivo de la paleta general sin colisión.
 */
export function getSupervisorColor(
  supervisorId: string | null | undefined,
  supervisores?: Array<{ id: string; nombreCompleto?: string }>
): string {
  if (!supervisorId || supervisorId === 'SIN_SUPERVISOR' || supervisorId === 'PENDIENTE') {
    return UNASSIGNED_SUPERVISOR_COLOR;
  }

  const supervisorInfo = supervisores?.find((s) => s.id === supervisorId);
  const nombre = supervisorInfo?.nombreCompleto;

  // Verificar si es supervisor de CDMX
  const cdmxKey = matchCdmxSupervisorKey(supervisorId, nombre);
  if (cdmxKey && CDMX_SPECIAL_PALETTE[cdmxKey]) {
    return CDMX_SPECIAL_PALETTE[cdmxKey].color;
  }

  // Si no es de CDMX, asignamos de la paleta general
  if (supervisores && supervisores.length > 0) {
    const nonCdmxSupervisors = supervisores.filter(
      (s) => !matchCdmxSupervisorKey(s.id, s.nombreCompleto)
    );
    const index = nonCdmxSupervisors.findIndex((s) => s.id === supervisorId);
    if (index >= 0) {
      return GENERAL_SUPERVISOR_PALETTE[index % GENERAL_SUPERVISOR_PALETTE.length];
    }
  }

  // Fallback determinista
  const hash = hashString(supervisorId);
  return GENERAL_SUPERVISOR_PALETTE[hash % GENERAL_SUPERVISOR_PALETTE.length];
}

/**
 * Construye un mapa de supervisorId -> color para acceso O(1) rápido.
 */
export function buildSupervisorColorMap(
  supervisores: Array<{ id: string; nombreCompleto?: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  supervisores.forEach((supervisor) => {
    map.set(supervisor.id, getSupervisorColor(supervisor.id, supervisores));
  });
  return map;
}
