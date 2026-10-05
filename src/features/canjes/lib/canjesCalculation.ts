export interface CanjesMetrics {
  conTicketCount: number;
  conTicketPiezas: number;
  sinTicketCount: number;
  sinTicketPiezas: number;
  fueraJornadaCount: number;
  fueraJornadaPiezas: number;
  totalCount: number;
  totalPiezas: number;
}

export interface CanjeRecordItem {
  id: string;
  fechaOperativa: string;
  created_at: string;
  subtipoRegistro: string;
  empleadoNombre: string;
  pdvNombre: string;
  pdvClaveBtl: string;
  cadena: string;
  materialNombre: string;
  cantidad: number;

  observaciones: string;
  fotoUrl: string | null;
  fotos: string[];
}

export interface CanjesDataResponse {
  ok: boolean;
  metrics: CanjesMetrics;
  records: CanjeRecordItem[];
  totalRecords: number;
  cadenasDisponibles: string[];
  message?: string;
}

export function filtrarYCalcularCanjes(
  all: any[],
  options: {
    subtipoFilter?: string;
    cadenaFilter?: string;
    searchQuery?: string;
    page?: number;
    pageSize?: number;
  },
  catalogoCadenas: string[] = []
): {
  metrics: CanjesMetrics;
  records: CanjeRecordItem[];
  totalRecords: number;
  cadenasDisponibles: string[];
} {
  const { subtipoFilter, cadenaFilter, searchQuery, page = 1, pageSize = 50 } = options;

  // Extraer todas las cadenas disponibles de los registros más el catálogo base
  const cadenasSet = new Set<string>();
  catalogoCadenas.forEach((c) => {
    if (c && c.trim()) cadenasSet.add(c.trim());
  });

  for (const rec of all) {
    const pdv = rec.pdv ?? {};
    const cadNombre = pdv.cadena?.nombre ?? rec.pdv_nombre_snapshot?.split(' ')?.[0] ?? '';
    if (cadNombre && cadNombre.trim()) {
      cadenasSet.add(cadNombre.trim());
    }
  }

  const cadenasDisponibles = Array.from(cadenasSet).sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );

  // 1. Filtrar base por Cadena (si se especifica una cadena distinta de TODAS)
  let baseFilteredByCadena = all;
  if (cadenaFilter && cadenaFilter !== 'TODAS') {
    const target = cadenaFilter.trim().toLowerCase();
    baseFilteredByCadena = all.filter((rec: any) => {
      const pdv = rec.pdv ?? {};
      const cadNombre = (pdv.cadena?.nombre ?? '').trim().toLowerCase();
      const cadId = (pdv.cadena?.id ?? '').trim().toLowerCase();
      return cadNombre === target || cadId === target;
    });
  }

  // 2. Calcular métricas basadas en la cadena seleccionada
  let conTicketCount = 0;
  let conTicketPiezas = 0;
  let sinTicketCount = 0;
  let sinTicketPiezas = 0;
  let fueraJornadaCount = 0;
  let fueraJornadaPiezas = 0;

  for (const rec of baseFilteredByCadena) {
    const cant = Number(rec.cantidad) || 0;
    const st = rec.subtipo_registro;

    if (st === 'CANJE_CON_TICKET') {
      conTicketCount += 1;
      conTicketPiezas += cant;
    } else if (st === 'CANJE_SIN_TICKET') {
      sinTicketCount += 1;
      sinTicketPiezas += cant;
    } else if (st === 'CANJE_FUERA_JORNADA') {
      fueraJornadaCount += 1;
      fueraJornadaPiezas += cant;
    }
  }

  const metrics: CanjesMetrics = {
    conTicketCount,
    conTicketPiezas,
    sinTicketCount,
    sinTicketPiezas,
    fueraJornadaCount,
    fueraJornadaPiezas,
    totalCount: baseFilteredByCadena.length,
    totalPiezas: conTicketPiezas + sinTicketPiezas + fueraJornadaPiezas,
  };

  // 3. Filtrar registros por subtipo y buscador para la tabla
  let filtered = baseFilteredByCadena;

  if (subtipoFilter && subtipoFilter !== 'TODOS') {
    filtered = filtered.filter((r) => r.subtipo_registro === subtipoFilter);
  }

  if (searchQuery && searchQuery.trim().length > 0) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter((r: any) => {
      const dermo = (r.empleado_nombre_snapshot ?? '').toLowerCase();
      const pdv = (r.pdv_nombre_snapshot ?? '').toLowerCase();
      const material = (r.material_nombre_snapshot ?? '').toLowerCase();
      const btl = (r.pdv?.clave_btl ?? '').toLowerCase();
      return dermo.includes(q) || pdv.includes(q) || material.includes(q) || btl.includes(q);
    });
  }

  const totalRecords = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  const formattedRecords: CanjeRecordItem[] = paginated.map((rec: any) => {
    const pdv = rec.pdv ?? {};
    const cadena = pdv.cadena?.nombre ?? 'General';
    const rawFotos = rec.foto_evidencia_url
      ? String(rec.foto_evidencia_url)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return {
      id: rec.id,
      fechaOperativa: rec.fecha_operativa,
      created_at: rec.created_at,
      subtipoRegistro: rec.subtipo_registro ?? 'CANJE_CON_TICKET',
      empleadoNombre: rec.empleado_nombre_snapshot ?? 'Desconocida',
      pdvNombre: pdv.nombre ?? rec.pdv_nombre_snapshot ?? 'Sin sucursal',
      pdvClaveBtl: pdv.clave_btl ?? '',
      cadena,
      materialNombre: rec.material_nombre_snapshot ?? 'Material sin nombre',
      cantidad: Number(rec.cantidad) || 0,

      observaciones: rec.observaciones ?? '',
      fotoUrl: rawFotos[0] ?? null,
      fotos: rawFotos,
    };
  });

  return {
    metrics,
    records: formattedRecords,
    totalRecords,
    cadenasDisponibles,
  };
}
