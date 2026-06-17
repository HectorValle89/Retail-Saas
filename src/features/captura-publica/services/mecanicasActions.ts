'use server';

import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { obtenerCapturaPublicaLinkParaRegistro } from './capturaPublicaService';
import {
  SUPERVISORES_OFICIALES,
  PRENDAS_PERMITIDAS,
  GENEROS_PERMITIDOS,
  TALLAS_PERMITIDAS,
} from './mecanicasConstants';
import { normalizarCiudad } from './mecanicasService';

export interface MecanicasActionState {
  ok: boolean;
  message: string;
  propuestaId?: string;
}

const INITIAL_ERROR =
  'No fue posible enviar tu registro. Por favor revisa los datos e intenta de nuevo.';

function normalizeText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

async function buildRequestMetadata() {
  const requestHeaders = await headers();
  return {
    canal: 'FORMULARIO_LEVANTAMIENTO_UNIFORMES',
    host: requestHeaders.get('host'),
    user_agent: requestHeaders.get('user-agent'),
    forwarded_for_present: Boolean(requestHeaders.get('x-forwarded-for')),
  };
}

export async function registrarPropuestaMecanica(
  slug: string,
  _prevState: MecanicasActionState,
  formData: FormData
): Promise<MecanicasActionState> {
  try {
    const service = createServiceClient();
    
    // Obtener información del link público de captura
    const link = await obtenerCapturaPublicaLinkParaRegistro(service, slug);

    const supervisorNombre = normalizeText(formData.get('supervisor_nombre'));
    const ciudadEnvioRaw = normalizeText(formData.get('ciudad_envio'));
    const recibeNombre = normalizeText(formData.get('recibe_nombre'));
    const direccionEnvioRaw = normalizeText(formData.get('direccion_envio'));
    const prendasJsonRaw = normalizeText(formData.get('prendas_json'));

    if (!supervisorNombre) {
      throw new Error('El nombre del supervisor es obligatorio.');
    }

    if (!ciudadEnvioRaw) {
      throw new Error('La ciudad de envío es obligatoria para la logística de entrega.');
    }

    const ciudadEnvio = normalizarCiudad(ciudadEnvioRaw);

    let direccionEnvio = direccionEnvioRaw;
    if (ciudadEnvio === 'CIUDAD DE MÉXICO') {
      if (!direccionEnvio || direccionEnvio.trim() === '') {
        direccionEnvio = 'ENTREGA PRESENCIAL (RECIBO EN PERSONA)';
      }
    } else {
      if (!direccionEnvio || direccionEnvio.trim() === '') {
        throw new Error('La dirección completa de envío es obligatoria para ciudades foráneas.');
      }
    }

    if (!recibeNombre) {
      throw new Error('El nombre de quien recibe es obligatorio.');
    }

    // Validar supervisor contra la lista oficial
    const supervisorOficial = SUPERVISORES_OFICIALES.find(
      (s) => s.toUpperCase() === supervisorNombre.toUpperCase()
    );

    if (!supervisorOficial) {
      throw new Error(
        `El supervisor "${supervisorNombre}" no forma parte del equipo de supervisores autorizado.`
      );
    }

    if (!prendasJsonRaw) {
      throw new Error('Debes seleccionar al menos una prenda de uniforme.');
    }

    let prendas: any[] = [];
    try {
      prendas = JSON.parse(prendasJsonRaw);
    } catch {
      throw new Error('El formato de las prendas seleccionadas no es válido.');
    }

    if (!Array.isArray(prendas) || prendas.length === 0) {
      throw new Error('Debes seleccionar al menos una prenda de uniforme.');
    }

    // Validar cada prenda
    for (const item of prendas) {
      const { prenda, genero, talla, cantidad } = item;

      if (!prenda || !PRENDAS_PERMITIDAS.includes(prenda)) {
        throw new Error(`La prenda "${prenda || ''}" no está permitida.`);
      }

      if (!genero || !GENEROS_PERMITIDOS.includes(genero)) {
        throw new Error(`El género "${genero || ''}" no está permitido.`);
      }

      if (!talla || !TALLAS_PERMITIDAS.includes(talla)) {
        throw new Error(`La talla "${talla || ''}" no está permitida.`);
      }

      const qty = Number(cantidad);
      if (Number.isNaN(qty) || qty <= 0) {
        throw new Error(
          `La cantidad para la prenda debe ser un número mayor a cero.`
        );
      }
    }



    const requestMetadata = await buildRequestMetadata();

    // Guardar en la tabla levantamiento_uniforme
    const { data: created, error: insertError } = await service
      .from('levantamiento_uniforme')
      .insert({
        cuenta_cliente_id: link.cuentaClienteId,
        supervisor_nombre: supervisorOficial,
        ciudad_envio: ciudadEnvio,
        recibe_nombre: recibeNombre,
        direccion_envio: direccionEnvio,
        prendas: prendas.map(({ prenda, genero, talla, cantidad }) => ({
          prenda,
          genero,
          talla,
          cantidad: Number(cantidad),
        })),
        metadata: {
          ...requestMetadata,
          link_slug: link.slug,
          link_nombre: link.nombre,
          cuenta_cliente_nombre: link.cuentaClienteNombre,
        },
      })
      .select('id')
      .maybeSingle();

    if (insertError || !created?.id) {
      throw new Error(insertError?.message ?? INITIAL_ERROR);
    }

    return {
      ok: true,
      message: '¡Registro de uniforme enviado con éxito! Muchas gracias por confirmar tus tallas.',
      propuestaId: String(created.id),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : INITIAL_ERROR,
    };
  }
}
