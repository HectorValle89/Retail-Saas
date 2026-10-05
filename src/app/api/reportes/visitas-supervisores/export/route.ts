import { NextRequest, NextResponse } from 'next/server';

import { requerirPuestosActivos } from '@/lib/auth/session';
import { obtenerVisitasSupervisoresDetalle } from '@/features/reportes/services/reporteVisitasSupervisoresService';
import { SUPERVISOR_CHECKLIST_ITEMS, isSupervisorChecklistItemNotApplicable } from '@/features/rutas/lib/supervisorVisitChecklist';

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);
    const { searchParams } = request.nextUrl;
    const periodo = searchParams.get('periodo') || undefined;
    const fechaInicio = searchParams.get('fechaInicio') || undefined;
    const fechaFin = searchParams.get('fechaFin') || undefined;

    if (!periodo && (!fechaInicio || !fechaFin)) {
      return NextResponse.json(
        { error: 'Debe proporcionar un periodo o un rango de fechas (fechaInicio y fechaFin).' },
        { status: 400 }
      );
    }

    const supervisorEmpleadoId = searchParams.get('supervisorEmpleadoId') || undefined;
    const estadoFiltro = searchParams.get('estadoFiltro') || undefined;

    // Consultamos la información con un límite alto (5000) para exportar todo el rango
    const data = await obtenerVisitasSupervisoresDetalle(actor, {
      periodo,
      fechaInicio,
      fechaFin,
      supervisorEmpleadoId,
      estadoFiltro,
      limit: 5000,
    });

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // 1. Hoja de Consolidado de Supervisores
    const supervisorMeta = new Map<string, { idNomina: string | null; puesto: string | null }>();
    for (const item of data.items) {
      if (!supervisorMeta.has(item.supervisorEmpleadoId)) {
        supervisorMeta.set(item.supervisorEmpleadoId, {
          idNomina: item.idNomina,
          puesto: item.puesto,
        });
      }
    }

    const resumenHeaders = [
      'Supervisor',
      'ID Nómina',
      'Puesto',
      'Rutas Planificadas',
      'Visitas Asignadas',
      'Visitas Completadas',
      '% Cumplimiento',
    ];

    const resumenRows = data.supervisores.map((sup) => {
      const meta = supervisorMeta.get(sup.supervisorEmpleadoId);
      const cumplimiento = sup.visitas > 0 ? (sup.completadas / sup.visitas) * 100 : 0;
      return [
        sup.supervisor,
        meta?.idNomina ?? 'Sin registro',
        meta?.puesto ?? 'Supervisor',
        sup.rutas,
        sup.visitas,
        sup.completadas,
        `${cumplimiento.toFixed(1)}%`,
      ];
    });

    const wsResumenData = [resumenHeaders, ...resumenRows];
    if (resumenRows.length === 0) {
      wsResumenData.push(['No hay datos de supervisores en este periodo', '', '', '', '', '', '']);
    }
    const wsResumen = XLSX.utils.aoa_to_sheet(wsResumenData);

    // Ajustar anchos de columnas para Hoja Resumen
    wsResumen['!cols'] = [
      { wch: 35 }, // Supervisor
      { wch: 15 }, // ID Nómina
      { wch: 18 }, // Puesto
      { wch: 20 }, // Rutas Planificadas
      { wch: 18 }, // Visitas Asignadas
      { wch: 20 }, // Visitas Completadas
      { wch: 18 }, // % Cumplimiento
    ];

    // Activar autofiltro para la pestaña de Consolidado
    wsResumen['!autofilter'] = {
      ref: `A1:${XLSX.utils.encode_col(resumenHeaders.length - 1)}${resumenRows.length + 1}`,
    };

    XLSX.utils.book_append_sheet(wb, wsResumen, 'Consolidado de Supervisores');

    // 2. Hoja de Detalle de Visitas (Simplificada y desglosada por campos de Checklist)
    const checklistHeaders: string[] = [];
    for (const chk of SUPERVISOR_CHECKLIST_ITEMS) {
      checklistHeaders.push(chk.label);
      if ('commentKey' in chk && chk.commentKey) {
        checklistHeaders.push(`Comentario: ${chk.commentLabel}`);
      }
    }

    const detalleHeaders = [
      'Fecha de Operación',
      'Día',
      'Supervisor',
      'ID Nómina',
      'PDV',
      'Clave BTL',
      'Estatus Visita',
      'Entrada (Check-in)',
      'Salida (Check-out)',
      'Foto Selfie (Entrada)',
      'Foto Evidencia (Salida)',
      'Comentarios Generales',
      ...checklistHeaders,
    ];

    const detalleRows = data.items.map((item) => {
      const checklistCalidad = item.checklistCalidad || {};
      const checklistComments = item.checklistComments || {};
      
      const checklistRowValues: string[] = [];
      for (const chk of SUPERVISOR_CHECKLIST_ITEMS) {
        const isNotApplicable = isSupervisorChecklistItemNotApplicable(chk.key, checklistCalidad);
        if (isNotApplicable) {
          checklistRowValues.push('N/A');
        } else {
          checklistRowValues.push(checklistCalidad[chk.key] === true ? 'SÍ' : 'NO');
        }

        if ('commentKey' in chk && chk.commentKey) {
          checklistRowValues.push(checklistComments[chk.commentKey] || '');
        }
      }

      return [
        item.fechaOperacion,
        item.diaLabel,
        item.supervisor,
        item.idNomina ?? 'Sin registro',
        item.pdv,
        item.pdvClaveBtl ?? 'Sin clave',
        item.estatus,
        item.checkInAt ? new Date(item.checkInAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : 'Sin registro',
        item.checkOutAt ? new Date(item.checkOutAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : 'Sin registro',
        item.selfieUrl ? 'Ver Selfie' : 'Pendiente',
        item.evidenciaUrl ? 'Ver Evidencia' : 'Pendiente',
        item.comentarios ?? 'Sin comentarios',
        ...checklistRowValues,
      ];
    });

    const wsDetalleData = [detalleHeaders, ...detalleRows];
    if (detalleRows.length === 0) {
      const emptyRow = Array(detalleHeaders.length).fill('');
      emptyRow[0] = 'No hay visitas registradas que cumplan con los filtros seleccionados';
      wsDetalleData.push(emptyRow);
    }
    const wsDetalle = XLSX.utils.aoa_to_sheet(wsDetalleData);

    // Ajustar anchos de columnas para Hoja Detalle
    const colsWidth = [
      { wch: 20 }, // Fecha de Operación
      { wch: 15 }, // Día
      { wch: 35 }, // Supervisor
      { wch: 15 }, // ID Nómina
      { wch: 35 }, // PDV
      { wch: 18 }, // Clave BTL
      { wch: 15 }, // Estatus Visita
      { wch: 22 }, // Entrada (Check-in)
      { wch: 22 }, // Salida (Check-out)
      { wch: 20 }, // Foto Selfie
      { wch: 20 }, // Foto Evidencia
      { wch: 40 }, // Comentarios Generales
    ];
    
    for (const h of checklistHeaders) {
      colsWidth.push({ wch: h.startsWith('Comentario:') ? 35 : 25 });
    }
    
    wsDetalle['!cols'] = colsWidth;

    // Agregar hipervínculos en las columnas de fotos (Selfie col J [índice 9], Evidencia col K [índice 10])
    for (let r = 1; r < wsDetalleData.length; r++) {
      const item = data.items[r - 1];
      if (!item) {
        continue;
      }

      if (item.selfieUrl) {
        const cellRef = XLSX.utils.encode_cell({ r, c: 9 });
        wsDetalle[cellRef] = {
          t: 's',
          v: 'Ver Selfie',
          l: { Target: item.selfieUrl, Tooltip: 'Abrir Foto Selfie' },
        };
      }

      if (item.evidenciaUrl) {
        const cellRef = XLSX.utils.encode_cell({ r, c: 10 });
        wsDetalle[cellRef] = {
          t: 's',
          v: 'Ver Evidencia',
          l: { Target: item.evidenciaUrl, Tooltip: 'Abrir Foto Evidencia' },
        };
      }
    }

    // Activar autofiltro para Detalle de Visitas
    wsDetalle['!autofilter'] = {
      ref: `A1:${XLSX.utils.encode_col(detalleHeaders.length - 1)}${wsDetalleData.length}`,
    };

    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle de Visitas');

    // Generar buffer XLSX
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Armar nombre del archivo amigable
    const safePeriodo = (fechaInicio && fechaFin)
      ? `${fechaInicio}_a_${fechaFin}`
      : periodo ? periodo.replace(/[^a-zA-Z0-9-]/g, '_') : 'reporte';
    const filename = `reporte-visitas-supervisores-${safePeriodo}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible exportar las visitas de supervisores a Excel.',
      },
      { status: 500 }
    );
  }
}
