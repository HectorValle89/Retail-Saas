import PptxGenJS from 'pptxgenjs';

export interface LastMilePptEntrega {
  id: string;
  estado: string;
  capturadoEn: string;
  pdvNombre: string;
  pdvClaveBtl: string | null;
  cadena: string | null;
  receptor: string;
  fotoAcuseUrl: string | null;
  fotoEntregaUrl: string | null;
}

interface LastMilePptResponse {
  data?: {
    periodo: string;
    total: number;
    truncated: boolean;
    entregas: LastMilePptEntrega[];
  };
  message?: string;
}

const SLIDE_WIDTH = 10;
const SLIDE_HEIGHT = 5.625;
const EVIDENCE_TOP = 1.55;
const EVIDENCE_BOX_WIDTH = 3.7;
const EVIDENCE_BOX_HEIGHT = SLIDE_HEIGHT - EVIDENCE_TOP - 0.35;
const EVIDENCE_GAP = 0.38;
const EVIDENCE_LEFT_X = (SLIDE_WIDTH - EVIDENCE_BOX_WIDTH * 2 - EVIDENCE_GAP) / 2;
const EVIDENCE_RIGHT_X = EVIDENCE_LEFT_X + EVIDENCE_BOX_WIDTH + EVIDENCE_GAP;

function buildPptDataUrl(periodo: string, cuentaClienteId?: string | null, tipoDispersion?: string) {
  const params = new URLSearchParams({ periodo });

  if (cuentaClienteId) {
    params.set('cuentaClienteId', cuentaClienteId);
  }
  if (tipoDispersion) {
    params.set('tipoDispersion', tipoDispersion);
  }

  return `/api/reportes/ultima-milla-ppt-data?${params.toString()}`;
}

async function fetchLastMilePptData(
  periodo: string,
  cuentaClienteId?: string | null,
  tipoDispersion?: string
) {
  const response = await fetch(buildPptDataUrl(periodo, cuentaClienteId, tipoDispersion), {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json().catch(() => ({}))) as LastMilePptResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? 'Error al obtener los registros de recepción.');
  }

  const entregas = payload.data?.entregas ?? [];

  if (entregas.length === 0) {
    throw new Error('No hay entregas registradas en este periodo.');
  }

  return {
    periodo: payload.data?.periodo ?? periodo,
    entregas,
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha desconocida';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDateOnly(value: string) {
  if (!value) return 'Fecha desconocida';
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha desconocida';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(date);
}

async function fetchImageAsBase64Jpeg(url: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        Accept: 'image/*',
      },
    });

    if (!response.ok) {
      console.warn(`[PPT Export] No se pudo obtener la imagen (${response.status}): ${url}`);
      return null;
    }

    let blob = await response.blob();
    if (!blob || blob.size === 0) return null;

    // Detectar si el blob o la URL corresponde a una imagen HEIC/HEIF
    const isHeic =
      blob.type.includes('heic') ||
      blob.type.includes('heif') ||
      /\.(heic|heif|hif)($|\?)/i.test(url);

    if (isHeic) {
      try {
        const { convertHeifToJpeg } = await import('@/lib/storage/clientImageCompression');
        const file = new File([blob], 'photo.heic', { type: blob.type || 'image/heic' });
        const converted = await convertHeifToJpeg(file);
        if (converted) {
          blob = converted;
        }
      } catch (heicErr) {
        console.error('[PPT Export] Error al convertir HEIC previo a la renderización:', heicErr);
      }
    }

    let objectUrl = URL.createObjectURL(blob);

    const tryRender = (src: string): Promise<string | null> => {
      return new Promise<string | null>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            const canvas = window.document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
            resolve(dataUrl);
          } catch (e) {
            resolve(null);
          }
        };
        img.onerror = () => {
          resolve(null);
        };
        img.src = src;
      });
    };

    let base64Result = await tryRender(objectUrl);
    URL.revokeObjectURL(objectUrl);

    // Fallback: si falló la carga (por ejemplo, el navegador no reconoció la extensión),
    // intentamos forzar la conversión HEIC como último recurso
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
      } catch (e) {
        // Ignorar error del fallback
      }
    }

    return base64Result;
  } catch (err) {
    console.error('[PPT Export] Error procesando imagen para el reporte:', err);
    return null;
  }
}

function addEvidenceImageDirect(
  slide: PptxGenJS.Slide,
  title: string,
  base64: string,
  x: number
) {
  slide.addText(title, {
    x,
    y: 1.22,
    w: EVIDENCE_BOX_WIDTH,
    h: 0.22,
    align: 'center',
    fontSize: 9.5,
    bold: true,
    color: '475569',
    margin: 0,
    fit: 'shrink',
  });

  slide.addShape('rect', {
    x,
    y: EVIDENCE_TOP,
    w: EVIDENCE_BOX_WIDTH,
    h: EVIDENCE_BOX_HEIGHT,
    fill: { color: 'F8FAFC', transparency: 100 },
    line: { color: 'E2E8F0', transparency: 10, width: 0.6 },
  });

  slide.addImage({
    x,
    y: EVIDENCE_TOP,
    w: EVIDENCE_BOX_WIDTH,
    h: EVIDENCE_BOX_HEIGHT,
    data: base64,
    sizing: { type: 'contain', w: EVIDENCE_BOX_WIDTH, h: EVIDENCE_BOX_HEIGHT },
  });
}

async function addEvidenceImage(
  slide: PptxGenJS.Slide,
  title: string,
  imageUrl: string | null,
  x: number
) {
  slide.addText(title, {
    x,
    y: 1.22,
    w: EVIDENCE_BOX_WIDTH,
    h: 0.22,
    align: 'center',
    fontSize: 9.5,
    bold: true,
    color: '475569',
    margin: 0,
    fit: 'shrink',
  });

  slide.addShape('rect', {
    x,
    y: EVIDENCE_TOP,
    w: EVIDENCE_BOX_WIDTH,
    h: EVIDENCE_BOX_HEIGHT,
    fill: { color: 'F8FAFC', transparency: 100 },
    line: { color: 'E2E8F0', transparency: 10, width: 0.6 },
  });

  if (!imageUrl) {
    slide.addText('Sin evidencia disponible', {
      x,
      y: EVIDENCE_TOP + 1.45,
      w: EVIDENCE_BOX_WIDTH,
      h: 0.7,
      fill: { color: 'F8FAFC' },
      margin: 0.1,
      align: 'center',
      fontSize: 10,
      color: '94A3B8',
      breakLine: false,
    });
    return;
  }

  const base64 = await fetchImageAsBase64Jpeg(imageUrl);

  if (!base64) {
    slide.addText('Sin evidencia disponible', {
      x,
      y: EVIDENCE_TOP + 1.45,
      w: EVIDENCE_BOX_WIDTH,
      h: 0.7,
      fill: { color: 'F8FAFC' },
      margin: 0.1,
      align: 'center',
      fontSize: 10,
      color: '94A3B8',
      breakLine: false,
    });
    return;
  }

  slide.addImage({
    x,
    y: EVIDENCE_TOP,
    w: EVIDENCE_BOX_WIDTH,
    h: EVIDENCE_BOX_HEIGHT,
    data: base64,
    sizing: { type: 'contain', w: EVIDENCE_BOX_WIDTH, h: EVIDENCE_BOX_HEIGHT },
  });
}

export async function generateLastMilePpt(
  periodo: string,
  cuentaClienteId?: string | null,
  tipoDispersion?: string
): Promise<void> {
  const { entregas } = await fetchLastMilePptData(periodo, cuentaClienteId, tipoDispersion);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'be te ele';
  pptx.subject = 'Evidencias de ultima milla';
  pptx.title = `Recepciones Ultima Milla ${periodo}`;
  pptx.company = 'be te ele';

  for (const entrega of entregas) {
    const slide = pptx.addSlide();
    const pdvSubtitle = [entrega.pdvClaveBtl, entrega.cadena].filter(Boolean).join(' · ');

    slide.background = { color: 'FFFFFF' };
    slide.addText('EVIDENCIA DE ULTIMA MILLA', {
      x: 0.55,
      y: 0.28,
      w: 5.6,
      h: 0.18,
      fontSize: 7.5,
      bold: true,
      color: '0069A6',
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(entrega.pdvNombre, {
      x: 0.55,
      y: 0.52,
      w: 7.75,
      h: 0.32,
      fontSize: 16,
      bold: true,
      color: '020617',
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(
      [`Receptor: ${entrega.receptor}`, `Fecha: ${formatDateTime(entrega.capturadoEn)}`]
        .concat(pdvSubtitle ? [`PDV: ${pdvSubtitle}`] : [])
        .join('  |  '),
      {
        x: 0.55,
        y: 0.92,
        w: 8.85,
        h: 0.22,
        fontSize: 8.5,
        color: '64748B',
        margin: 0,
        breakLine: false,
        fit: 'shrink',
      }
    );
    slide.addText(entrega.estado, {
      x: 8.35,
      y: 0.28,
      w: 1.1,
      h: 0.25,
      fontSize: 8,
      bold: true,
      align: 'center',
      color: '047857',
      fill: { color: 'D1FAE5' },
      margin: 0.04,
      fit: 'shrink',
    });

    await addEvidenceImage(slide, 'Acuse firmado', entrega.fotoAcuseUrl, EVIDENCE_LEFT_X);
    await addEvidenceImage(slide, 'Entrega fisica', entrega.fotoEntregaUrl, EVIDENCE_RIGHT_X);
  }

  await pptx.writeFile({ fileName: `Recepciones_Ultima_Milla_${periodo}.pptx` });
}

export async function generateUniformsPpt(
  periodo: string,
  cuentaClienteId?: string | null
): Promise<void> {
  const response = await fetch(
    `/api/reportes/uniformes-ppt-data?periodo=${periodo}${cuentaClienteId ? `&cuentaClienteId=${cuentaClienteId}` : ''}`,
    {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  const payload = (await response.json().catch(() => ({}))) as LastMilePptResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? 'Error al obtener los registros de entrega de uniformes.');
  }

  const entregas = payload.data?.entregas ?? [];

  if (entregas.length === 0) {
    throw new Error('No hay entregas de uniformes registradas en este periodo.');
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'be te ele';
  pptx.subject = 'Evidencias de entrega de uniformes';
  pptx.title = `Entregas Uniformes ${periodo}`;
  pptx.company = 'be te ele';

  for (const entrega of entregas) {
    const slide = pptx.addSlide();
    const pdvSubtitle = [entrega.pdvClaveBtl, entrega.cadena].filter(Boolean).join(' · ');

    slide.background = { color: 'FFFFFF' };
    slide.addText('EVIDENCIA DE ENTREGA DE UNIFORME', {
      x: 0.55,
      y: 0.28,
      w: 5.6,
      h: 0.18,
      fontSize: 7.5,
      bold: true,
      color: '059669',
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(entrega.pdvNombre, {
      x: 0.55,
      y: 0.52,
      w: 7.75,
      h: 0.32,
      fontSize: 16,
      bold: true,
      color: '020617',
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(
      [`Recibió: ${entrega.receptor}`, `Fecha: ${formatDateTime(entrega.capturadoEn)}`]
        .concat(pdvSubtitle ? [`PDV: ${pdvSubtitle}`] : [])
        .join('  |  '),
      {
        x: 0.55,
        y: 0.92,
        w: 8.85,
        h: 0.22,
        fontSize: 8.5,
        color: '64748B',
        margin: 0,
        breakLine: false,
        fit: 'shrink',
      }
    );
    slide.addText(entrega.estado, {
      x: 8.35,
      y: 0.28,
      w: 1.1,
      h: 0.25,
      fontSize: 8,
      bold: true,
      align: 'center',
      color: '047857',
      fill: { color: 'D1FAE5' },
      margin: 0.04,
      fit: 'shrink',
    });

    await addEvidenceImage(slide, 'Acuse firmado', entrega.fotoAcuseUrl, EVIDENCE_LEFT_X);
    await addEvidenceImage(
      slide,
      'Persona recibiendo el uniforme',
      entrega.fotoEntregaUrl,
      EVIDENCE_RIGHT_X
    );
  }

  await pptx.writeFile({ fileName: `Evidencias_Entrega_Uniformes_${periodo}.pptx` });
}

export interface GenerateCanjesPptOptions {
  periodo?: string;
  fechaInicio?: string;
  fechaFin?: string;
  subtipo?: string;
  cadena?: string;
  cuentaClienteId?: string | null;
}

export async function generateCanjesPpt(
  periodoOrOptions: string | GenerateCanjesPptOptions,
  cuentaClienteIdParam?: string | null
): Promise<void> {
  let url = '/api/reportes/canjes-ppt-data?';
  let titlePeriod = 'Seleccion';

  if (typeof periodoOrOptions === 'string') {
    url += `periodo=${encodeURIComponent(periodoOrOptions)}`;
    titlePeriod = periodoOrOptions;
    if (cuentaClienteIdParam) {
      url += `&cuentaClienteId=${encodeURIComponent(cuentaClienteIdParam)}`;
    }
  } else {
    const opts = periodoOrOptions;
    const params = new URLSearchParams();
    if (opts.fechaInicio && opts.fechaFin) {
      params.set('fechaInicio', opts.fechaInicio);
      params.set('fechaFin', opts.fechaFin);
      titlePeriod = `${opts.fechaInicio}_al_${opts.fechaFin}`;
    } else if (opts.periodo) {
      params.set('periodo', opts.periodo);
      titlePeriod = opts.periodo;
    }
    if (opts.subtipo) {
      params.set('subtipo', opts.subtipo);
    }
    if (opts.cadena) {
      params.set('cadena', opts.cadena);
      titlePeriod += `_${opts.cadena.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }
    if (opts.cuentaClienteId || cuentaClienteIdParam) {
      params.set('cuentaClienteId', (opts.cuentaClienteId || cuentaClienteIdParam)!);
    }
    url += params.toString();
  }

  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: {
      periodo: string;
      total: number;
      canjes: any[];
    };
    message?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? 'Error al obtener los registros de canjes.');
  }

  const allCanjes = payload.data?.canjes ?? [];
  const canjes = allCanjes.filter(
    (c: any) => Array.isArray(c.fotos) && c.fotos.length > 0
  );

  if (canjes.length === 0) {
    throw new Error('No se encontraron registros con evidencia fotográfica en el periodo seleccionado.');
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'be te ele';
  pptx.subject = 'Evidencias de canjes';
  pptx.title = `Canjes ${titlePeriod}`;
  pptx.company = 'be te ele';

  for (const canje of canjes) {
    const rawFotos = canje.fotos ?? [];
    if (rawFotos.length === 0) continue;

    // Descargar y validar las imágenes en memoria primero
    const resolvedImages: Array<{ base64: string; index: number }> = [];
    for (let idx = 0; idx < rawFotos.length; idx++) {
      const base64 = await fetchImageAsBase64Jpeg(rawFotos[idx]);
      if (base64) {
        resolvedImages.push({ base64, index: idx + 1 });
      }
    }

    // Si ninguna foto pudo descargarse, saltar este registro para no generar una diapositiva vacía
    if (resolvedImages.length === 0) {
      continue;
    }

    const totalValidFotos = resolvedImages.length;
    const pdvSubtitle = [canje.pdvClaveBtl, canje.cadena].filter(Boolean).join(' · ');

    const buildSlideHeader = (slide: PptxGenJS.Slide, partText?: string) => {
      slide.background = { color: 'FFFFFF' };

      const badgeLabel = (canje.subtipoRegistro ?? 'CANJE').replace('CANJE_', '').replace(/_/g, ' ');
      
      // Línea 1: Fecha | 🎫 Con Ticket | Nombre DC
      const headerText = `${formatDateOnly(canje.fechaOperativa)}   |   🎫 ${badgeLabel}   |   ${canje.dermoNombre}${partText ? ` (${partText})` : ''}`;
      slide.addText(headerText, {
        x: 0.55,
        y: 0.25,
        w: 8.85,
        h: 0.18,
        fontSize: 10,
        color: '64748B',
        margin: 0,
        fit: 'shrink',
      });

      // Línea 2: Punto de Venta
      slide.addText(canje.pdvNombre, {
        x: 0.55,
        y: 0.45,
        w: 8.85,
        h: 0.25,
        fontSize: 14,
        bold: true,
        color: '020617',
        margin: 0,
        fit: 'shrink',
      });

      // Línea 3: REFERENCIA PDV
      if (pdvSubtitle) {
        slide.addText(pdvSubtitle, {
          x: 0.55,
          y: 0.68,
          w: 8.85,
          h: 0.18,
          fontSize: 9,
          color: '64748B',
          margin: 0,
          fit: 'shrink',
        });
      }

      // Línea 4: PRODUCTO CANJEADO
      slide.addText(canje.materialNombre, {
        x: 0.55,
        y: 0.85,
        w: 8.85,
        h: 0.2,
        fontSize: 11,
        bold: true,
        color: '334155',
        margin: 0,
        fit: 'shrink',
      });

      // Línea 5: Cantidad
      const amountText = `${canje.cantidad} unidad${canje.cantidad !== 1 ? 'es' : ''}`;
      slide.addText(amountText, {
        x: 0.55,
        y: 1.05,
        w: 8.85,
        h: 0.18,
        fontSize: 10,
        color: '475569',
        margin: 0,
        fit: 'shrink',
      });
    };

    if (totalValidFotos <= 2) {
      const slide = pptx.addSlide();
      buildSlideHeader(slide);
      if (totalValidFotos === 1) {
        const x = (SLIDE_WIDTH - EVIDENCE_BOX_WIDTH) / 2;
        addEvidenceImageDirect(slide, `Evidencia ${resolvedImages[0].index}`, resolvedImages[0].base64, x);
      } else {
        addEvidenceImageDirect(slide, `Evidencia ${resolvedImages[0].index}`, resolvedImages[0].base64, EVIDENCE_LEFT_X);
        addEvidenceImageDirect(slide, `Evidencia ${resolvedImages[1].index}`, resolvedImages[1].base64, EVIDENCE_RIGHT_X);
      }
    } else {
      // Si hay 3 o más fotos, renderizarlas todas en grupos de a 2 por diapositiva para no omitir NINGUNA
      for (let i = 0; i < totalValidFotos; i += 2) {
        const slide = pptx.addSlide();
        buildSlideHeader(slide, `Fotos ${i + 1}-${Math.min(i + 2, totalValidFotos)} de ${totalValidFotos}`);

        const chunk = resolvedImages.slice(i, i + 2);
        if (chunk.length === 1) {
          const x = (SLIDE_WIDTH - EVIDENCE_BOX_WIDTH) / 2;
          addEvidenceImageDirect(slide, `Evidencia ${chunk[0].index}`, chunk[0].base64, x);
        } else {
          addEvidenceImageDirect(slide, `Evidencia ${chunk[0].index}`, chunk[0].base64, EVIDENCE_LEFT_X);
          addEvidenceImageDirect(slide, `Evidencia ${chunk[1].index}`, chunk[1].base64, EVIDENCE_RIGHT_X);
        }
      }
    }
  }

  await pptx.writeFile({ fileName: `Evidencias_Canjes_${titlePeriod}.pptx` });
}

async function addLoveEvidenceImages(slide: PptxGenJS.Slide, fotos: string[]) {
  if (fotos.length === 0) {
    const x = (SLIDE_WIDTH - EVIDENCE_BOX_WIDTH) / 2;
    await addEvidenceImage(slide, 'Evidencia fotográfica', null, x);
  } else if (fotos.length === 1) {
    const x = (SLIDE_WIDTH - EVIDENCE_BOX_WIDTH) / 2;
    await addEvidenceImage(slide, 'Evidencia 1', fotos[0], x);
  } else {
    await addEvidenceImage(slide, 'Evidencia 1', fotos[0], EVIDENCE_LEFT_X);
    await addEvidenceImage(slide, 'Evidencia 2', fotos[1], EVIDENCE_RIGHT_X);
  }
}

export async function generateLoveIsdinPpt(
  periodo: string,
  subtipo: 'LOVE_EXITOSO' | 'LOVE_FALLIDO',
  cuentaClienteId?: string | null
): Promise<void> {
  const response = await fetch(
    `/api/reportes/love-isdin-ppt-data?periodo=${periodo}&subtipo=${subtipo}${cuentaClienteId ? `&cuentaClienteId=${cuentaClienteId}` : ''}`,
    {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: {
      periodo: string;
      subtipo: string;
      total: number;
      registros: any[];
    };
    message?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? 'Error al obtener los registros de Love ISDIN.');
  }

  const allRegistros = payload.data?.registros ?? [];
  const registros = allRegistros.filter(
    (r: any) => Array.isArray(r.fotos) && r.fotos.length > 0
  );

  if (registros.length === 0) {
    const tipoLabel = subtipo === 'LOVE_EXITOSO' ? 'exitosos' : 'fallidos';
    throw new Error(`No hay registros de Love ISDIN ${tipoLabel} con evidencia fotográfica en este periodo.`);
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'be te ele';
  const labelSubtipo = subtipo === 'LOVE_EXITOSO' ? 'Exitosos' : 'Fallidos';
  pptx.subject = `Evidencias de Love ISDIN ${labelSubtipo}`;
  pptx.title = `Love ISDIN ${labelSubtipo} ${periodo}`;
  pptx.company = 'be te ele';

  for (const registro of registros) {
    const slide = pptx.addSlide();
    const pdvSubtitle = [registro.pdvClaveBtl, registro.cadena].filter(Boolean).join(' · ');

    slide.background = { color: 'FFFFFF' };
    slide.addText(`EVIDENCIA LOVE ISDIN (${labelSubtipo.toUpperCase()})`, {
      x: 0.55,
      y: 0.28,
      w: 5.6,
      h: 0.18,
      fontSize: 7.5,
      bold: true,
      color: subtipo === 'LOVE_EXITOSO' ? '10B981' : 'EF4444', // Emerald vs Rose/Red
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(registro.pdvNombre, {
      x: 0.55,
      y: 0.52,
      w: 7.75,
      h: 0.32,
      fontSize: 16,
      bold: true,
      color: '020617',
      margin: 0,
      fit: 'shrink',
    });

    const infoParts = [
      `Dermoconsejera: ${registro.dermoNombre}`,
      `Cantidad: ${registro.cantidad}`,
      `Fecha: ${formatDateOnly(registro.fechaOperativa)}`,
    ];

    if (pdvSubtitle) {
      infoParts.push(`PDV: ${pdvSubtitle}`);
    }

    if (registro.observaciones) {
      infoParts.push(`Obs: ${registro.observaciones}`);
    }

    slide.addText(infoParts.join('  |  '), {
      x: 0.55,
      y: 0.92,
      w: 8.85,
      h: 0.35,
      fontSize: 8.5,
      color: '64748B',
      margin: 0,
      fit: 'shrink',
    });

    slide.addText(labelSubtipo.toUpperCase(), {
      x: 8.35,
      y: 0.28,
      w: 1.1,
      h: 0.25,
      fontSize: 8,
      bold: true,
      align: 'center',
      color: subtipo === 'LOVE_EXITOSO' ? '047857' : 'B91C1C',
      fill: { color: subtipo === 'LOVE_EXITOSO' ? 'D1FAE5' : 'FEE2E2' },
      margin: 0.04,
      fit: 'shrink',
    });

    await addLoveEvidenceImages(slide, registro.fotos);
  }

  await pptx.writeFile({ fileName: `Evidencias_Love_ISDIN_${labelSubtipo}_${periodo}.pptx` });
}
