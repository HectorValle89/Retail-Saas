import type { CanjeRecordItem } from './canjesService';

function getSubtipoLabel(subtipo: string) {
  switch (subtipo) {
    case 'CANJE_CON_TICKET':
      return 'Canje Con Ticket';
    case 'CANJE_SIN_TICKET':
      return 'Canje Sin Ticket';
    case 'CANJE_FUERA_JORNADA':
      return 'Canje Fuera de Jornada';
    default:
      return subtipo;
  }
}

export async function generarExcelCanjes(
  records: CanjeRecordItem[],
  fechaInicio: string,
  fechaFin: string,
  cadenaFilter?: string
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const isFilteredCadena = Boolean(cadenaFilter && cadenaFilter !== 'TODAS');
  const sheetName = isFilteredCadena
    ? `Canjes ${cadenaFilter}`.slice(0, 31).replace(/[*?:/\\\[\]]/g, '')
    : 'Reporte de Canjes';
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = [
    { header: 'FECHA OPERATIVA', key: 'fechaOperativa', width: 16 },
    { header: 'SUBTIPO DE CANJE', key: 'subtipo', width: 22 },
    { header: 'DERMOCONSEJERA', key: 'dermo', width: 32 },
    { header: 'CADENA', key: 'cadena', width: 18 },
    { header: 'PDV / SUCURSAL', key: 'pdv', width: 30 },
    { header: 'CLAVE BTL', key: 'claveBtl', width: 16 },
    { header: 'MATERIAL CANJEADO', key: 'material', width: 32 },
    { header: 'CANTIDAD', key: 'cantidad', width: 12 },

    { header: 'OBSERVACIONES', key: 'observaciones', width: 35 },
    { header: 'FECHA REGISTRO', key: 'capturadoEn', width: 22 },
    { header: 'FOTO EVIDENCIA', key: 'fotoUrl', width: 50 },
  ];

  // Estilar cabeceras
  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4F46E5' }, // Indigo / Marca BTL
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  records.forEach((rec) => {
    const fotosList = rec.fotos && rec.fotos.length > 0 ? rec.fotos : rec.fotoUrl ? [rec.fotoUrl] : [];
    const fotoFullUrl =
      fotosList.length > 0
        ? fotosList
            .map((fUrl) => {
              if (fUrl.startsWith('http')) return fUrl;
              if (fUrl.startsWith('/api/')) return `${origin}${fUrl}`;
              const slashIdx = fUrl.indexOf('/');
              if (slashIdx > 0) {
                const bucket = fUrl.substring(0, slashIdx);
                const route = fUrl.substring(slashIdx + 1);
                return `${origin}/api/reportes/imagen-proxy?bucket=${encodeURIComponent(
                  bucket
                )}&route=${encodeURIComponent(route)}`;
              }
              return fUrl;
            })
            .join('\n')
        : 'Sin evidencia';

    const row = worksheet.addRow({
      fechaOperativa: rec.fechaOperativa,
      subtipo: getSubtipoLabel(rec.subtipoRegistro),
      dermo: rec.empleadoNombre,
      cadena: rec.cadena,
      pdv: rec.pdvNombre,
      claveBtl: rec.pdvClaveBtl || 'N/A',
      material: rec.materialNombre,
      cantidad: rec.cantidad,

      observaciones: rec.observaciones || '-',
      capturadoEn: rec.created_at ? new Date(rec.created_at).toLocaleString('es-MX') : '-',
      fotoUrl: fotoFullUrl,
    });

    row.alignment = { vertical: 'middle' };
  });

  // Exportar y gatillar descarga directa en navegador
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cadenaSuffix = isFilteredCadena
    ? `_${cadenaFilter!.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}`
    : '';
  a.download = `Reporte_Canjes${cadenaSuffix}_${fechaInicio}_al_${fechaFin}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
