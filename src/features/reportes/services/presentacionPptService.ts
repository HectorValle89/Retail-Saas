import type { SupervisorEvidenciaData } from './presentacionService';
import type { TipoEvidencia } from '@/features/evidencias/types';

// Helper to format date in Spanish Latino
function formatFechaLocal(isoString: string) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Fecha inválida';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

// Helper to get image proxy path or R2 proxy URL
function getProxyImageUrl(originalKey: string) {
  if (!originalKey) return '';
  if (originalKey.startsWith('/api/')) return originalKey;
  return `/api/storage/r2?key=${encodeURIComponent(originalKey)}`;
}

export interface ProcessedImage {
  data: string;
  width: number;
  height: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImagePlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function calculateContainedPlacement(
  imageWidth: number,
  imageHeight: number,
  box: BoundingBox
): ImagePlacement {
  if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
    return { x: box.x, y: box.y, w: box.w, h: box.h };
  }

  const imageRatio = imageWidth / imageHeight;
  const boxRatio = box.w / box.h;

  let renderW: number;
  let renderH: number;

  if (imageRatio > boxRatio) {
    // La imagen es proporcionalmente más ancha que la caja: ajustamos al ancho máximo
    renderW = box.w;
    renderH = box.w / imageRatio;
  } else {
    // La imagen es proporcionalmente más alta que la caja: ajustamos al alto máximo
    renderH = box.h;
    renderW = box.h * imageRatio;
  }

  // Centrar dentro de la caja delimitadora
  const renderX = box.x + (box.w - renderW) / 2;
  const renderY = box.y + (box.h - renderH) / 2;

  return {
    x: Number(renderX.toFixed(3)),
    y: Number(renderY.toFixed(3)),
    w: Number(renderW.toFixed(3)),
    h: Number(renderH.toFixed(3)),
  };
}

async function fetchImageAsBase64Jpeg(url: string): Promise<ProcessedImage | null> {
  if (typeof window === 'undefined' || !url) return null;
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'image/*' },
    });

    if (!response.ok) return null;

    let blob = await response.blob();
    if (!blob || blob.size === 0) return null;

    const isHeic =
      blob.type.includes('heic') ||
      blob.type.includes('heif') ||
      /\.(heic|heif|hif)($|\?)/i.test(url);

    if (isHeic) {
      try {
        const { convertHeifToJpeg } = await import('@/lib/storage/clientImageCompression');
        const file = new File([blob], 'photo.heic', { type: blob.type || 'image/heic' });
        const converted = await convertHeifToJpeg(file);
        if (converted) blob = converted;
      } catch (heicErr) {
        console.error('[PPT Evidencias] Error convirtiendo HEIC:', heicErr);
      }
    }

    let objectUrl = URL.createObjectURL(blob);

    const tryRender = (src: string): Promise<ProcessedImage | null> => {
      return new Promise<ProcessedImage | null>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            const canvas = window.document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
            resolve({
              data: dataUrl,
              width: canvas.width,
              height: canvas.height,
            });
          } catch (e) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    };

    let base64Result = await tryRender(objectUrl);
    URL.revokeObjectURL(objectUrl);

    if (!base64Result && !isHeic) {
      try {
        const { convertHeifToJpeg } = await import('@/lib/storage/clientImageCompression');
        const file = new File([blob], 'photo.heic', { type: 'image/heic' });
        const converted = await convertHeifToJpeg(file);
        if (converted && (converted as any) !== file) {
          const fallbackUrl = URL.createObjectURL(converted);
          base64Result = await tryRender(fallbackUrl);
          URL.revokeObjectURL(fallbackUrl);
        }
      } catch (e) {}
    }

    return base64Result;
  } catch (err) {
    return null;
  }
}

// Helper to format tipo_evidencia to readable text
export function getTipoEvidenciaLabel(tipo: TipoEvidencia): string {
  switch (tipo) {
    case 'MATERIAL_POP':
      return 'Entrega de Displays y Material POP de Temporada';
    case 'CAMPANA_ESTACIONAL':
      return 'Campaña Estacional (Mes del Cáncer de Mama)';
    case 'MALETA_VANITY':
      return 'Eventos Maleta Vanity';
    case 'ADOPTADO_SAN_PABLO':
      return 'San Pablo (Plan de Cuidado Especial)';
    case 'EVENTO_ESPECIAL':
      return 'Exhibiciones Adicionales y Botaderos';
    case 'PRODUCTO_MES_LIVERPOOL':
      return 'Evento de Formación / Capacitación en Campo';
    case 'IMPLEMENTACION':
      return 'Evidencias de Implementación en PDV';
    default:
      return 'Evidencia de Campo';
  }
}

export async function generarPresentacionEvidencias(
  tipo: TipoEvidencia,
  datos: SupervisorEvidenciaData[]
): Promise<void> {
  // Dynamically import pptxgenjs on the client side
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'be te ele';
  pptx.subject = 'Evidencias de Campo Supervisor';
  pptx.title = `${getTipoEvidenciaLabel(tipo)}`;
  pptx.company = 'be te ele';

  // 1. Cover Slide
  const coverSlide = pptx.addSlide();
  coverSlide.background = { color: '0F172A' }; // Sleek Dark Slate

  coverSlide.addText('REPORTES DE EVIDENCIAS DE CAMPO', {
    x: 0.8,
    y: 1.8,
    w: 8.4,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: '38BDF8', // Light Blue Accent
  });

  coverSlide.addText(getTipoEvidenciaLabel(tipo).toUpperCase(), {
    x: 0.8,
    y: 2.4,
    w: 8.4,
    h: 0.8,
    fontSize: 16,
    bold: true,
    color: 'FFFFFF',
  });

  coverSlide.addText(`Fecha de Generación: ${formatFechaLocal(new Date().toISOString())}`, {
    x: 0.8,
    y: 4.5,
    w: 8.4,
    h: 0.4,
    fontSize: 11,
    color: '94A3B8',
  });

  // 2. Data Slides
  for (const item of datos) {
    const slide = pptx.addSlide();

    // Background and Header Bar
    slide.background = { color: 'FFFFFF' };

    const pdvNombre = item.pdv?.nombre ?? 'Sin PDV asignado';
    slide.addText(`PDV: ${pdvNombre}`, {
      x: 0.5,
      y: 0.25,
      w: 6.5,
      h: 0.35,
      fontSize: 16,
      bold: true,
      color: '0F172A',
    });

    const infoCadena = item.pdv?.cadena?.nombre ? `Cadena: ${item.pdv.cadena.nombre}  |  ` : '';
    const supervisorNombre = item.supervisor?.nombre_completo || '';
    const infoSupervisor = supervisorNombre ? `Supervisor: ${supervisorNombre}  |  ` : '';
    const infoSub = `${infoCadena}${infoSupervisor}Fecha: ${formatFechaLocal(item.fechaOperacion || item.created_at)}`;

    slide.addText(infoSub, {
      x: 0.5,
      y: 0.62,
      w: 6.5,
      h: 0.4,
      fontSize: 9,
      color: '64748B',
    });

    // Metadata checklist side card
    const checklist = item.metadata?.checklist ?? {};
    let metadataText = '';

    if (tipo === 'MATERIAL_POP') {
      const buenEstado = checklist.llegado_buen_estado === true ? 'Sí' : checklist.llegado_buen_estado === false ? 'No (Incidencia)' : 'No reportado';
      const colocado = checklist.colocado_correcto === true ? 'Sí' : checklist.colocado_correcto === false ? 'No' : 'No reportado';
      metadataText = `¿Buen estado?: ${buenEstado}\n¿Colocado?: ${colocado}`;
    } else if (tipo === 'MALETA_VANITY') {
      const bloque = checklist.bloque_evento === 'BLOQUE_1' ? 'Inicio (11:00 AM)' : checklist.bloque_evento === 'BLOQUE_2' ? 'Cierre (6:00 PM)' : 'N/A';
      metadataText = `Bloque: ${bloque}`;
    } else if (tipo === 'ADOPTADO_SAN_PABLO') {
      metadataText = [
        `Zona cajas: ${checklist.botiquin_zona_cajas ? 'Sí' : 'No'}`,
        `Prod. visible: ${checklist.producto_visible ? 'Sí' : 'No'}`,
        `Precios OK: ${checklist.precios_correctos ? 'Sí' : 'No'}`,
        `POP visible: ${checklist.material_pop_visible ? 'Sí' : 'No'}`,
      ].join('\n');
    }

    if (tipo === 'IMPLEMENTACION') {
      metadataText = `Comentario:\n${item.observaciones || 'Sin comentarios'}`;
    } else if (item.observaciones) {
      metadataText += `${metadataText ? '\n\n' : ''}Notas:\n${item.observaciones}`;
    }

    if (metadataText) {
      slide.addShape('rect', {
        x: 7.2,
        y: 0.28,
        w: 2.3,
        h: 0.95,
        fill: { color: 'F8FAFC' },
        line: { color: 'E2E8F0', width: 1 },
      });

      slide.addText(metadataText, {
        x: 7.25,
        y: 0.32,
        w: 2.2,
        h: 0.85,
        fontSize: 7.5,
        color: '334155',
        margin: 0.05,
        fit: 'shrink',
      });
    }

    // Grid de imágenes
    const fotos = item.fotos;
    const numFotos = fotos.length;

    if (numFotos === 1) {
      const photo = fotos[0];
      const boxX = 0.5;
      const boxY = 1.35;
      const boxW = 9.0;
      const boxH = 3.9;

      slide.addText(photo.label || 'Evidencia principal', {
        x: boxX,
        y: boxY - 0.22,
        w: boxW,
        h: 0.2,
        fontSize: 9,
        bold: true,
        color: '475569',
        align: 'center',
      });

      const proxyUrl = getProxyImageUrl(photo.originalKey || (photo as any).objectKey || (photo as any).key);
      const processed = await fetchImageAsBase64Jpeg(proxyUrl);

      if (processed) {
        const placement = calculateContainedPlacement(processed.width, processed.height, {
          x: boxX,
          y: boxY,
          w: boxW,
          h: boxH,
        });

        slide.addImage({
          x: placement.x,
          y: placement.y,
          w: placement.w,
          h: placement.h,
          data: processed.data,
        });
      } else {
        slide.addImage({
          x: boxX,
          y: boxY,
          w: boxW,
          h: boxH,
          path: proxyUrl,
          sizing: { type: 'contain', w: boxW, h: boxH },
        });
      }
    } else if (numFotos === 2) {
      const boxW = 4.3;
      const boxH = 3.7;
      const boxY = 1.55;
      const gap = 0.4;
      const leftMargin = 0.5;

      for (let idx = 0; idx < fotos.length; idx++) {
        const photo = fotos[idx];
        const boxX = leftMargin + idx * (boxW + gap);

        slide.addText(photo.label || `Evidencia ${idx + 1}`, {
          x: boxX,
          y: boxY - 0.25,
          w: boxW,
          h: 0.2,
          fontSize: 9,
          bold: true,
          color: '475569',
          align: 'center',
        });

        const proxyUrl = getProxyImageUrl(photo.originalKey || (photo as any).objectKey || (photo as any).key);
        const processed = await fetchImageAsBase64Jpeg(proxyUrl);

        if (processed) {
          const placement = calculateContainedPlacement(processed.width, processed.height, {
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH,
          });

          slide.addImage({
            x: placement.x,
            y: placement.y,
            w: placement.w,
            h: placement.h,
            data: processed.data,
          });
        } else {
          slide.addImage({
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH,
            path: proxyUrl,
            sizing: { type: 'contain', w: boxW, h: boxH },
          });
        }
      }
    } else {
      const maxColumns = Math.min(numFotos, 3);
      const boxW = 2.8;
      const boxH = 3.7;
      const boxY = 1.55;
      const gap = 0.3;
      const leftMargin = 0.5;

      const sliceFotos = fotos.slice(0, 3);
      for (let idx = 0; idx < sliceFotos.length; idx++) {
        const photo = sliceFotos[idx];
        const boxX = leftMargin + idx * (boxW + gap);

        slide.addText(photo.label || `Evidencia ${idx + 1}`, {
          x: boxX,
          y: boxY - 0.25,
          w: boxW,
          h: 0.2,
          fontSize: 8.5,
          bold: true,
          color: '475569',
          align: 'center',
          fit: 'shrink',
        });

        const proxyUrl = getProxyImageUrl(photo.originalKey || (photo as any).objectKey || (photo as any).key);
        const processed = await fetchImageAsBase64Jpeg(proxyUrl);

        if (processed) {
          const placement = calculateContainedPlacement(processed.width, processed.height, {
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH,
          });

          slide.addImage({
            x: placement.x,
            y: placement.y,
            w: placement.w,
            h: placement.h,
            data: processed.data,
          });
        } else {
          slide.addImage({
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH,
            path: proxyUrl,
            sizing: { type: 'contain', w: boxW, h: boxH },
          });
        }
      }
    }
  }

  // Save the slide deck file in browser
  const safeTitle = getTipoEvidenciaLabel(tipo).replace(/\s+/g, '_');
  await pptx.writeFile({ fileName: `Evidencias_${safeTitle}_${new Date().toISOString().slice(0, 10)}.pptx` });
}

export async function generarExcelIncidenciasPop(
  datos: SupervisorEvidenciaData[]
): Promise<void> {
  // Dynamically import exceljs on client side
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const worksheet = workbook.addWorksheet('Incidencias Material POP');

  // Filter records to those with pop good state = false
  const incidencias = datos.filter(
    (item) =>
      item.tipoEvidencia === 'MATERIAL_POP' &&
      item.metadata?.checklist?.llegado_buen_estado === false
  );

  // Set page setup and columns
  worksheet.columns = [
    { header: 'CLAVE BTL / ID PDV', key: 'claveBtl', width: 22 },
    { header: 'CADENA', key: 'cadena', width: 18 },
    { header: 'SUCURSAL / PDV', key: 'sucursal', width: 30 },
    { header: 'FECHA OPERACIÓN', key: 'fecha', width: 18 },
    { header: 'SUPERVISOR', key: 'supervisor', width: 32 },
    { header: 'ESTADO DEL MATERIAL', key: 'estado', width: 25 },
    { header: 'FOTO ACUSE REBO', key: 'fotoAcuse', width: 50 },
    { header: 'FOTO DETALLE INCIDENCIA', key: 'fotoDetalle', width: 50 },
    { header: 'OBSERVACIONES DETALLADAS', key: 'observaciones', width: 45 },
  ];

  // Stylize headers
  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4F46E5' }, // Indigo
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  // Add records
  incidencias.forEach((item) => {
    const supervisorNombre = item.supervisor?.nombre_completo || 'Supervisor';
    
    // Resolve R2 URLs
    const acusePhoto = item.fotos.find((f) => f.label.includes('Acuse') || f.originalKey.includes('acuse') || f.orientation === 'portrait');
    const detailPhoto = item.fotos.find((f) => !f.label.includes('Acuse') && !f.originalKey.includes('acuse') && f.orientation === 'landscape');

    const host = typeof window !== 'undefined' ? window.location.origin : '';
    const fotoAcuseUrl = acusePhoto ? `${host}${getProxyImageUrl(acusePhoto.originalKey)}` : 'Sin foto';
    const fotoDetalleUrl = detailPhoto ? `${host}${getProxyImageUrl(detailPhoto.originalKey)}` : 'Sin foto';

    worksheet.addRow({
      claveBtl: item.pdv?.claveBtl ?? 'N/A',
      cadena: item.pdv?.cadena?.nombre ?? 'General',
      sucursal: item.pdv?.nombre ?? 'General',
      fecha: item.fechaOperacion,
      supervisor: supervisorNombre,
      estado: 'Con Incidencia / Dañado',
      fotoAcuse: fotoAcuseUrl,
      fotoDetalle: fotoDetalleUrl,
      observaciones: item.observaciones ?? 'Sin observaciones escritas.',
    });
  });

  // Apply row borders and fonts
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.font = { name: 'Arial', size: 9.5 };
    row.alignment = { vertical: 'middle', wrapText: true };
    
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } },
      };
    });
  });

  // Write file in client browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `Incidencias_Material_POP_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
