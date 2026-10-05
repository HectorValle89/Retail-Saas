'use server';

import { revalidateTag } from 'next/cache';
import { publishUiChanges } from '@/lib/ui-change/server';
import { buildUiChangeScope, buildUiChangeTargetsFromBusinessEvent } from '@/lib/ui-change/types';
import { obtenerClienteAdmin } from '@/lib/auth/admin';
import { requerirAdministradorActivo, requerirPuestosActivos } from '@/lib/auth/session';
import { resolveSingleTenantAccountId } from '@/lib/tenant/singleTenant';
import type { PdvActionState, PdvCreateDraft } from './state';
import { processMaterializationDirtyQueue } from '@/features/asignaciones/services/asignacionMaterializationService';
import {
  getPlaneacionMensualCacheTag,
  refrescarPlaneacionMensualSnapshot,
} from '@/features/asignaciones/services/planeacionMensualReadService';
import { refrescarCuotaMensualResumen } from '@/features/asignaciones/services/planeacionCuotaResumenService';
import {
  sincronizarAltaPdvCascada,
  sincronizarInactivacionPdvCascada,
  sincronizarReasignacionSupervisorCascada,
} from '@/features/asignaciones/services/operationalLifecycleService';

interface AdminServiceResult {
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>;
}

type HorarioModeInput = 'CADENA' | 'PERSONALIZADO';

interface PlaneacionPdvRpcClient {
  rpc(
    name:
      | 'sincronizar_estado_pdv_operativo'
      | 'sincronizar_supervisor_pdv_operativo'
      | 'encolar_pdv_asignaciones_operativas',
    params: Record<string, string>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function buildState(partial: Partial<PdvActionState>): PdvActionState {
  return {
    ok: false,
    message: null,
    fields: null,
    ...partial,
  };
}

function captureCreatePdvDraft(formData: FormData): PdvCreateDraft {
  return {
    clave_btl: String(formData.get('clave_btl') ?? '').trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    cadena_id: String(formData.get('cadena_id') ?? '').trim(),
    ciudad_id: String(formData.get('ciudad_id') ?? '').trim(),
    zona: String(formData.get('zona') ?? '').trim(),
    direccion: String(formData.get('direccion') ?? '').trim(),
    formato: String(formData.get('formato') ?? '').trim(),
    id_cadena: String(formData.get('id_cadena') ?? '').trim(),
    estatus:
      String(formData.get('estatus') ?? 'ACTIVO').trim() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
    coordenadas: String(formData.get('coordenadas') ?? '').trim(),
    radio_tolerancia_metros: String(formData.get('radio_tolerancia_metros') ?? '').trim(),
    permite_checkin_con_justificacion: formData.get('permite_checkin_con_justificacion') === 'on',
    supervisor_empleado_id: String(formData.get('supervisor_empleado_id') ?? '').trim(),
    horario_mode:
      String(formData.get('horario_mode') ?? 'CADENA').trim() === 'PERSONALIZADO'
        ? 'PERSONALIZADO'
        : 'CADENA',
    turno_nomenclatura: String(formData.get('turno_nomenclatura') ?? '').trim(),
    hora_entrada: String(formData.get('hora_entrada') ?? '').trim(),
    hora_salida: String(formData.get('hora_salida') ?? '').trim(),
    horario_observaciones: String(formData.get('horario_observaciones') ?? '').trim(),
  };
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${label} es obligatorio.`);
  }
  return normalized;
}

function normalizePdvStatus(value: FormDataEntryValue | null) {
  const status = normalizeRequiredText(value, 'Estatus');
  if (status !== 'ACTIVO' && status !== 'INACTIVO') {
    throw new Error('El estatus del PDV no es valido.');
  }
  return status;
}

function normalizeCoordinate(
  value: FormDataEntryValue | null,
  label: string,
  min: number,
  max: number
) {
  const raw = normalizeRequiredText(value, label);
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} esta fuera de rango.`);
  }

  return Number(parsed.toFixed(7));
}

function normalizeIntegerRange(
  value: FormDataEntryValue | null,
  label: string,
  min: number,
  max: number
) {
  const raw = normalizeRequiredText(value, label);
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} debe estar entre ${min} y ${max}.`);
  }

  return parsed;
}

function normalizeTime(value: FormDataEntryValue | null, label: string) {
  const time = normalizeRequiredText(value, label);

  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`${label} no tiene un formato valido.`);
  }

  return time;
}

function normalizeCoordinatesFromFormData(formData: FormData) {
  const coordinatesRaw = normalizeOptionalText(formData.get('coordenadas'));

  if (coordinatesRaw) {
    const parts = coordinatesRaw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length !== 2) {
      throw new Error('Coordenadas debe tener el formato "latitud, longitud".');
    }

    const latitud = normalizeCoordinate(parts[0], 'Latitud', -90, 90);
    const longitud = normalizeCoordinate(parts[1], 'Longitud', -180, 180);

    return { latitud, longitud };
  }

  const latitud = normalizeCoordinate(formData.get('latitud'), 'Latitud', -90, 90);
  const longitud = normalizeCoordinate(formData.get('longitud'), 'Longitud', -180, 180);

  return { latitud, longitud };
}

function normalizeHorarioMode(value: FormDataEntryValue | null): HorarioModeInput {
  const mode = normalizeRequiredText(value, 'Modo de horario');
  if (mode !== 'CADENA' && mode !== 'PERSONALIZADO') {
    throw new Error('El modo de horario no es valido.');
  }
  return mode;
}

function normalizeBoolean(value: FormDataEntryValue | null) {
  return value === 'on';
}

async function getAdminService(): Promise<AdminServiceResult> {
  const { service, error } = obtenerClienteAdmin();
  if (!service) {
    throw new Error(error ?? 'No fue posible inicializar el servicio administrativo.');
  }

  return { service };
}

async function registrarEventoAudit(
  service: AdminServiceResult['service'],
  actorUsuarioId: string,
  tabla: string,
  registroId: string,
  payload: Record<string, unknown>,
  cuentaClienteId: string | null = null
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: cuentaClienteId,
  });
}

async function obtenerZonaCiudad(service: AdminServiceResult['service'], ciudadId: string) {
  const { data, error } = await service
    .from('ciudad')
    .select('zona')
    .eq('id', ciudadId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible resolver la ciudad seleccionada.');
  }

  return data.zona as string;
}

async function validarClaveBtlUnica(
  service: AdminServiceResult['service'],
  claveBtl: string,
  currentPdvId?: string | null
) {
  const { data } = await service.from('pdv').select('id').eq('clave_btl', claveBtl).maybeSingle();

  if (data && data.id !== currentPdvId) {
    throw new Error(`La clave BTL ${claveBtl} ya existe en otro PDV.`);
  }
}

async function validarSupervisorActivo(
  service: AdminServiceResult['service'],
  supervisorEmpleadoId: string
) {
  const { data, error } = await service
    .from('empleado')
    .select('id, nombre_completo, puesto, estatus_laboral')
    .eq('id', supervisorEmpleadoId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? 'Supervisor no encontrado.');
  }

  if (data.puesto !== 'SUPERVISOR' || data.estatus_laboral !== 'ACTIVO') {
    throw new Error('El supervisor seleccionado no esta activo o no tiene puesto SUPERVISOR.');
  }

  return data;
}

async function validarCoordenadasUnicas(
  service: AdminServiceResult['service'],
  latitud: number,
  longitud: number,
  currentPdvId?: string | null
) {
  const { data, error } = await service
    .from('geocerca_pdv')
    .select('pdv_id, pdv:pdv_id(nombre, clave_btl)')
    .eq('latitud', latitud)
    .eq('longitud', longitud)
    .maybeSingle();

  if (error && !/multiple/i.test(error.message)) {
    throw new Error(error.message);
  }

  const current = data as {
    pdv_id: string;
    pdv?: { nombre?: string; clave_btl?: string }[] | null;
  } | null;
  if (current && current.pdv_id !== currentPdvId) {
    const pdv = Array.isArray(current.pdv) ? current.pdv[0] : null;
    const nombre = pdv?.nombre ?? current.pdv_id;
    const clave = pdv?.clave_btl ? ` (${pdv.clave_btl})` : '';
    throw new Error(`Las coordenadas ya estan configuradas en ${nombre}${clave}.`);
  }
}

async function obtenerPdvMetadata(service: AdminServiceResult['service'], pdvId: string) {
  const { data, error } = await service
    .from('pdv')
    .select('metadata')
    .eq('id', pdvId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? 'PDV no encontrado.');
  }

  return (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<
    string,
    unknown
  >;
}

async function obtenerCatalogoTurnosCadena(service: AdminServiceResult['service']) {
  const { data } = await service
    .from('configuracion')
    .select('valor')
    .eq('clave', 'asistencias.san_pablo.catalogo_turnos')
    .maybeSingle();

  const payload =
    data?.valor && typeof data.valor === 'object' ? (data.valor as Record<string, unknown>) : {};
  const turnos = Array.isArray(payload.turnos) ? payload.turnos : [];

  return turnos
    .map((item) => {
      const turno = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const nomenclatura = normalizeOptionalText(turno.nomenclatura as string | null);
      if (!nomenclatura) {
        return null;
      }

      return {
        nomenclatura,
        turno: normalizeOptionalText(turno.turno as string | null),
        horario: normalizeOptionalText(turno.horario as string | null),
        horaEntrada: normalizeOptionalText(turno.hora_entrada as string | null),
        horaSalida: normalizeOptionalText(turno.hora_salida as string | null),
      };
    })
    .filter(
      (
        item
      ): item is {
        nomenclatura: string;
        turno: string | null;
        horario: string | null;
        horaEntrada: string | null;
        horaSalida: string | null;
      } => Boolean(item)
    );
}

async function sincronizarSupervisorPdv(
  service: AdminServiceResult['service'],
  cuentaClienteId: string,
  pdvId: string,
  supervisorEmpleadoId: string,
  usuarioId: string
) {
  const { error } = await (service as unknown as PlaneacionPdvRpcClient).rpc(
    'sincronizar_supervisor_pdv_operativo',
    {
      p_cuenta_cliente_id: cuentaClienteId,
      p_pdv_id: pdvId,
      p_supervisor_empleado_id: supervisorEmpleadoId,
      p_usuario_id: usuarioId,
      p_motivo: 'Actualización desde el catálogo administrativo de PDVs',
    }
  );

  if (error) throw new Error(error.message);
}

async function sincronizarEstadoPdvOperativo(
  service: AdminServiceResult['service'],
  cuentaClienteId: string,
  pdvId: string,
  estado: 'ACTIVO' | 'INACTIVO',
  usuarioId: string
) {
  const { error } = await (service as unknown as PlaneacionPdvRpcClient).rpc(
    'sincronizar_estado_pdv_operativo',
    {
      p_cuenta_cliente_id: cuentaClienteId,
      p_pdv_id: pdvId,
      p_estado: estado,
      p_usuario_id: usuarioId,
      p_motivo: 'Actualización desde el catálogo administrativo de PDVs',
    }
  );

  if (error) throw new Error(error.message);
}

function getPlaneacionMonths() {
  const currentMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const next = new Date(`${currentMonth}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return [`${currentMonth}-01`, next.toISOString().slice(0, 10)];
}

async function refreshPlaneacionPdv(
  service: AdminServiceResult['service'],
  cuentaClienteId: string,
  pdvId: string,
  refreshQuota: boolean
) {
  await processMaterializationDirtyQueue({ limit: 250 }, service as never);
  for (const month of getPlaneacionMonths()) {
    if (refreshQuota) {
      await refrescarCuotaMensualResumen(service as never, {
        cuentaClienteId,
        mes: month,
        pdvIds: [pdvId],
      });
    }
    await refrescarPlaneacionMensualSnapshot(service as never, cuentaClienteId, month, [pdvId]);
    revalidateTag(getPlaneacionMensualCacheTag(cuentaClienteId, month), 'max');
  }
}

async function enqueuePdvAssignments(
  service: AdminServiceResult['service'],
  cuentaClienteId: string,
  pdvId: string,
  motivo: string
) {
  const { error } = await (service as unknown as PlaneacionPdvRpcClient).rpc(
    'encolar_pdv_asignaciones_operativas',
    {
      p_cuenta_cliente_id: cuentaClienteId,
      p_pdv_id: pdvId,
      p_motivo: motivo,
    }
  );
  if (error) throw new Error(error.message);
}

async function vincularPdvACuentaCliente(
  service: AdminServiceResult['service'],
  pdvId: string,
  cuentaClienteId: string
) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing, error: existingError } = await service
    .from('cuenta_cliente_pdv')
    .select('id, activo, fecha_inicio, fecha_fin')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('pdv_id', pdvId)
    .is('fecha_fin', null)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    const { error } = await service
      .from('cuenta_cliente_pdv')
      .update({
        activo: true,
        fecha_inicio: existing.fecha_inicio ?? today,
        fecha_fin: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await service.from('cuenta_cliente_pdv').insert({
    cuenta_cliente_id: cuentaClienteId,
    pdv_id: pdvId,
    activo: true,
    fecha_inicio: today,
    fecha_fin: null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function desactivarHorariosActivos(service: AdminServiceResult['service'], pdvId: string) {
  await service
    .from('horario_pdv')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('pdv_id', pdvId)
    .eq('activo', true);
}

async function aplicarHorarioPdv(
  service: AdminServiceResult['service'],
  pdvId: string,
  mode: HorarioModeInput,
  payload: {
    turnoNomenclatura: string | null;
    horaEntrada: string | null;
    horaSalida: string | null;
    observaciones: string | null;
  }
) {
  const metadata = await obtenerPdvMetadata(service, pdvId);

  if (mode === 'CADENA') {
    const turnoNomenclatura = payload.turnoNomenclatura;
    if (!turnoNomenclatura) {
      throw new Error('Selecciona un turno de cadena para aplicar herencia.');
    }

    const catalogo = await obtenerCatalogoTurnosCadena(service);
    const turno = catalogo.find((item) => item.nomenclatura === turnoNomenclatura);

    if (!turno || !turno.horaEntrada || !turno.horaSalida) {
      throw new Error('No fue posible resolver el horario heredado desde el catalogo de cadena.');
    }

    await desactivarHorariosActivos(service, pdvId);

    const { error } = await service
      .from('pdv')
      .update({
        horario_entrada: turno.horaEntrada,
        horario_salida: turno.horaSalida,
        metadata: {
          ...metadata,
          horario_mode: 'CADENA',
          horario_chain_nomenclatura: turno.nomenclatura,
          horario_chain_turno: turno.turno,
          horario_chain_horario: turno.horario,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', pdvId);

    if (error) {
      throw new Error(error.message);
    }

    return {
      horaEntrada: turno.horaEntrada,
      horaSalida: turno.horaSalida,
      turnoNomenclatura: turno.nomenclatura,
      turnDescription: turno.turno ?? turno.horario,
    };
  }

  const horaEntrada = payload.horaEntrada
    ? normalizeTime(payload.horaEntrada, 'Hora de entrada')
    : null;
  const horaSalida = payload.horaSalida
    ? normalizeTime(payload.horaSalida, 'Hora de salida')
    : null;

  if (!horaEntrada || !horaSalida) {
    throw new Error('El horario personalizado requiere hora de entrada y salida.');
  }

  if (horaEntrada >= horaSalida) {
    throw new Error('La hora de entrada debe ser menor a la hora de salida.');
  }

  await desactivarHorariosActivos(service, pdvId);

  const { error: insertError } = await service.from('horario_pdv').insert({
    pdv_id: pdvId,
    nivel_prioridad: 1,
    fecha_especifica: null,
    dia_semana: null,
    codigo_turno: payload.turnoNomenclatura,
    hora_entrada: horaEntrada,
    hora_salida: horaSalida,
    activo: true,
    observaciones: payload.observaciones,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: updateError } = await service
    .from('pdv')
    .update({
      horario_entrada: horaEntrada,
      horario_salida: horaSalida,
      metadata: {
        ...metadata,
        horario_mode: 'PERSONALIZADO',
        horario_chain_nomenclatura: null,
        horario_chain_turno: null,
        horario_chain_horario: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', pdvId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    horaEntrada,
    horaSalida,
    turnoNomenclatura: payload.turnoNomenclatura,
    turnDescription: payload.observaciones,
  };
}

async function upsertGeocercaPdv(
  service: AdminServiceResult['service'],
  pdvId: string,
  latitud: number,
  longitud: number,
  radioMetros: number,
  permiteJustificacion: boolean
) {
  const { error } = await service.from('geocerca_pdv').upsert(
    {
      pdv_id: pdvId,
      latitud,
      longitud,
      radio_tolerancia_metros: radioMetros,
      permite_checkin_con_justificacion: permiteJustificacion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'pdv_id' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function publishPdvUiChanges(
  actor: Awaited<ReturnType<typeof requerirAdministradorActivo>>,
  service: AdminServiceResult['service'],
  params: {
    pdvId: string;
    eventType: string;
    includeScheduleConsumers?: boolean;
    includeSupervisorConsumers?: boolean;
    includeGeocercaConsumers?: boolean;
  }
) {
  const scopes = [
    buildUiChangeScope('cuenta', actor.cuentaClienteId),
    buildUiChangeScope('pdv', params.pdvId),
    actor.cuentaClienteId ? null : buildUiChangeScope('global'),
  ];
  const modules = new Set<string>(['pdvs', 'asignaciones']);
  const surfaces = new Set<string>(['panel', 'tabla', 'shell']);

  if (params.includeScheduleConsumers) {
    modules.add('dashboard');
    modules.add('ruta-semanal');
    modules.add('asistencias');
  }

  if (params.includeSupervisorConsumers) {
    modules.add('dashboard');
    modules.add('ruta-semanal');
    modules.add('asistencias');
    modules.add('campanas');
    modules.add('ventas');
    modules.add('love-isdin');
    modules.add('materiales');
    modules.add('reportes');
    modules.add('captura-publica');
    modules.add('canjes');
  }

  if (params.includeGeocercaConsumers) {
    modules.add('dashboard');
    modules.add('asistencias');
  }

  await publishUiChanges(
    buildUiChangeTargetsFromBusinessEvent({
      eventType: params.eventType,
      modules: Array.from(modules),
      surfaces: Array.from(surfaces),
      scopes,
      cuentaClienteId: actor.cuentaClienteId ?? null,
      empleadoId: actor.empleadoId,
      roleTargets: ['ALL'],
      metadata: { pdvId: params.pdvId },
    }),
    { service }
  );
}

export async function crearPdv(
  _prevState: PdvActionState,
  formData: FormData
): Promise<PdvActionState> {
  const actor = await requerirAdministradorActivo();
  const fields = captureCreatePdvDraft(formData);

  try {
    const { service } = await getAdminService();
    const cuentaClienteId = resolveSingleTenantAccountId(actor.cuentaClienteId);
    const claveBtl = normalizeRequiredText(formData.get('clave_btl'), 'Clave BTL').toUpperCase();
    const nombre = normalizeRequiredText(formData.get('nombre'), 'Nombre del PDV');
    const cadenaId = normalizeRequiredText(formData.get('cadena_id'), 'Cadena');
    const ciudadId = normalizeRequiredText(formData.get('ciudad_id'), 'Ciudad');
    const zona =
      normalizeOptionalText(formData.get('zona')) ?? (await obtenerZonaCiudad(service, ciudadId));
    const direccion = normalizeOptionalText(formData.get('direccion'));
    const formato = normalizeOptionalText(formData.get('formato'));
    const idCadena = normalizeOptionalText(formData.get('id_cadena'));
    const estatus = normalizePdvStatus(formData.get('estatus'));
    const { latitud, longitud } = normalizeCoordinatesFromFormData(formData);
    const radioMetros = normalizeIntegerRange(
      formData.get('radio_tolerancia_metros'),
      'Radio de geocerca',
      1,
      1000
    );
    const permiteJustificacion = normalizeBoolean(
      formData.get('permite_checkin_con_justificacion')
    );
    const supervisorEmpleadoId = normalizeRequiredText(
      formData.get('supervisor_empleado_id'),
      'Supervisor'
    );
    const horarioMode = normalizeHorarioMode(formData.get('horario_mode'));
    const turnoNomenclatura = normalizeOptionalText(formData.get('turno_nomenclatura'));
    const horaEntrada = normalizeOptionalText(formData.get('hora_entrada'));
    const horaSalida = normalizeOptionalText(formData.get('hora_salida'));
    const observacionesHorario = normalizeOptionalText(formData.get('horario_observaciones'));

    await validarClaveBtlUnica(service, claveBtl);
    await validarCoordenadasUnicas(service, latitud, longitud);
    await validarSupervisorActivo(service, supervisorEmpleadoId);

    const { data: insertedPdv, error: insertError } = await service
      .from('pdv')
      .insert({
        clave_btl: claveBtl,
        cadena_id: cadenaId,
        ciudad_id: ciudadId,
        id_cadena: idCadena,
        nombre,
        direccion,
        zona,
        formato,
        estatus,
        metadata: {
          source: 'modulo_pdvs_admin',
        },
      })
      .select('id')
      .maybeSingle();

    if (insertError || !insertedPdv) {
      throw new Error(insertError?.message ?? 'No fue posible crear el PDV.');
    }

    try {
      await vincularPdvACuentaCliente(service, insertedPdv.id, cuentaClienteId);
      await sincronizarEstadoPdvOperativo(
        service,
        cuentaClienteId,
        insertedPdv.id,
        estatus,
        actor.usuarioId
      );
      await upsertGeocercaPdv(
        service,
        insertedPdv.id,
        latitud,
        longitud,
        radioMetros,
        permiteJustificacion
      );
      await sincronizarSupervisorPdv(
        service,
        cuentaClienteId,
        insertedPdv.id,
        supervisorEmpleadoId,
        actor.usuarioId
      );
      const horario = await aplicarHorarioPdv(service, insertedPdv.id, horarioMode, {
        turnoNomenclatura,
        horaEntrada,
        horaSalida,
        observaciones: observacionesHorario,
      });

      await registrarEventoAudit(
        service,
        actor.usuarioId,
        'pdv',
        insertedPdv.id,
        {
          evento: 'pdv_creado_admin',
          cuenta_cliente_id: cuentaClienteId,
          clave_btl: claveBtl,
          nombre,
          cadena_id: cadenaId,
          ciudad_id: ciudadId,
          zona,
          geocerca: {
            latitud,
            longitud,
            radio_metros: radioMetros,
            permite_justificacion: permiteJustificacion,
          },
          horario_mode: horarioMode,
          horario_entrada: horario.horaEntrada,
          horario_salida: horario.horaSalida,
          supervisor_empleado_id: supervisorEmpleadoId,
        },
        cuentaClienteId
      );
    } catch (error) {
      await service.from('pdv').delete().eq('id', insertedPdv.id);
      throw error;
    }

    await publishPdvUiChanges(actor, service, {
      pdvId: insertedPdv.id,
      eventType: 'pdv_creado_admin',
      includeScheduleConsumers: true,
      includeSupervisorConsumers: true,
      includeGeocercaConsumers: true,
    });
    await sincronizarAltaPdvCascada(service as never, {
      pdvId: insertedPdv.id,
      cuentaClienteId,
      supervisorId: supervisorEmpleadoId,
      usuarioId: actor.usuarioId,
    });
    await refreshPlaneacionPdv(service, cuentaClienteId, insertedPdv.id, true);
    return buildState({
      ok: true,
      message: 'PDV creado con geocerca, horario, supervisor, cuotas y cuenta ISDIN.',
    });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible crear el PDV.',
      fields,
    });
  }
}

export async function actualizarPdvBase(
  _prevState: PdvActionState,
  formData: FormData
): Promise<PdvActionState> {
  const actor = await requerirAdministradorActivo();

  try {
    const { service } = await getAdminService();
    const cuentaClienteId = resolveSingleTenantAccountId(actor.cuentaClienteId);
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'PDV');
    const claveBtl = normalizeRequiredText(formData.get('clave_btl'), 'Clave BTL').toUpperCase();
    const nombre = normalizeRequiredText(formData.get('nombre'), 'Nombre del PDV');
    const cadenaId = normalizeRequiredText(formData.get('cadena_id'), 'Cadena');
    const ciudadId = normalizeRequiredText(formData.get('ciudad_id'), 'Ciudad');
    const zona =
      normalizeOptionalText(formData.get('zona')) ?? (await obtenerZonaCiudad(service, ciudadId));
    const direccion = normalizeOptionalText(formData.get('direccion'));
    const formato = normalizeOptionalText(formData.get('formato'));
    const idCadena = normalizeOptionalText(formData.get('id_cadena'));
    const estatus = normalizePdvStatus(formData.get('estatus'));

    await validarClaveBtlUnica(service, claveBtl, pdvId);

    const { error } = await service
      .from('pdv')
      .update({
        clave_btl: claveBtl,
        nombre,
        cadena_id: cadenaId,
        ciudad_id: ciudadId,
        zona,
        direccion,
        formato,
        id_cadena: idCadena,
        estatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pdvId);

    if (error) {
      throw new Error(error.message);
    }

    await sincronizarEstadoPdvOperativo(
      service,
      cuentaClienteId,
      pdvId,
      estatus,
      actor.usuarioId
    );

    if (estatus === 'INACTIVO') {
      await sincronizarInactivacionPdvCascada(service as never, {
        pdvId,
        cuentaClienteId,
        usuarioId: actor.usuarioId,
        motivo: 'Inactivación desde catálogo de PDVs',
      });
    } else if (estatus === 'ACTIVO') {
      const { data: spRow } = await service
        .from('supervisor_pdv')
        .select('empleado_id')
        .eq('pdv_id', pdvId)
        .eq('activo', true)
        .order('fecha_inicio', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (spRow?.empleado_id) {
        await sincronizarAltaPdvCascada(service as never, {
          pdvId,
          cuentaClienteId,
          supervisorId: spRow.empleado_id,
          usuarioId: actor.usuarioId,
        });
      }
    }

    await registrarEventoAudit(service, actor.usuarioId, 'pdv', pdvId, {
      evento: 'pdv_base_actualizado_admin',
      clave_btl: claveBtl,
      nombre,
      cadena_id: cadenaId,
      ciudad_id: ciudadId,
      zona,
      estatus,
    });

    await publishPdvUiChanges(actor, service, {
      pdvId,
      eventType: 'pdv_base_actualizado_admin',
      includeScheduleConsumers: true,
      includeSupervisorConsumers: true,
    });
    await refreshPlaneacionPdv(service, cuentaClienteId, pdvId, true);
    return buildState({ ok: true, message: 'Datos base del PDV actualizados.' });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible actualizar el PDV.',
    });
  }
}

export async function actualizarGeocercaPdv(
  _prevState: PdvActionState,
  formData: FormData
): Promise<PdvActionState> {
  const actor = await requerirAdministradorActivo();

  try {
    const { service } = await getAdminService();
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'PDV');
    const { latitud, longitud } = normalizeCoordinatesFromFormData(formData);
    const radioMetros = normalizeIntegerRange(
      formData.get('radio_tolerancia_metros'),
      'Radio de geocerca',
      1,
      1000
    );
    const permiteJustificacion = normalizeBoolean(
      formData.get('permite_checkin_con_justificacion')
    );

    await validarCoordenadasUnicas(service, latitud, longitud, pdvId);
    await upsertGeocercaPdv(service, pdvId, latitud, longitud, radioMetros, permiteJustificacion);

    await registrarEventoAudit(service, actor.usuarioId, 'geocerca_pdv', pdvId, {
      evento: 'pdv_geocerca_actualizada_admin',
      latitud,
      longitud,
      radio_metros: radioMetros,
      permite_justificacion: permiteJustificacion,
    });

    await publishPdvUiChanges(actor, service, {
      pdvId,
      eventType: 'pdv_geocerca_actualizada_admin',
      includeGeocercaConsumers: true,
    });
    return buildState({ ok: true, message: 'Geocerca del PDV actualizada.' });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible actualizar la geocerca.',
    });
  }
}

export async function actualizarHorarioPdv(
  _prevState: PdvActionState,
  formData: FormData
): Promise<PdvActionState> {
  const actor = await requerirAdministradorActivo();

  try {
    const { service } = await getAdminService();
    const cuentaClienteId = resolveSingleTenantAccountId(actor.cuentaClienteId);
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'PDV');
    const horarioMode = normalizeHorarioMode(formData.get('horario_mode'));
    const turnoNomenclatura = normalizeOptionalText(formData.get('turno_nomenclatura'));
    const horaEntrada = normalizeOptionalText(formData.get('hora_entrada'));
    const horaSalida = normalizeOptionalText(formData.get('hora_salida'));
    const observacionesHorario = normalizeOptionalText(formData.get('horario_observaciones'));

    const horario = await aplicarHorarioPdv(service, pdvId, horarioMode, {
      turnoNomenclatura,
      horaEntrada,
      horaSalida,
      observaciones: observacionesHorario,
    });
    await enqueuePdvAssignments(
      service,
      cuentaClienteId,
      pdvId,
      'CATALOGO_PDV_HORARIO'
    );

    await registrarEventoAudit(service, actor.usuarioId, 'horario_pdv', pdvId, {
      evento: 'pdv_horario_actualizado_admin',
      horario_mode: horarioMode,
      turno_nomenclatura: horario.turnoNomenclatura,
      horario_entrada: horario.horaEntrada,
      horario_salida: horario.horaSalida,
      detalle: horario.turnDescription,
    });

    await publishPdvUiChanges(actor, service, {
      pdvId,
      eventType: 'pdv_horario_actualizado_admin',
      includeScheduleConsumers: true,
    });
    await refreshPlaneacionPdv(service, cuentaClienteId, pdvId, false);
    return buildState({ ok: true, message: 'Horario del PDV actualizado.' });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible actualizar el horario.',
    });
  }
}

export async function actualizarSupervisorPdv(
  _prevState: PdvActionState,
  formData: FormData
): Promise<PdvActionState> {
  const actor = await requerirAdministradorActivo();

  try {
    const { service } = await getAdminService();
    const cuentaClienteId = resolveSingleTenantAccountId(actor.cuentaClienteId);
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'PDV');
    const supervisorEmpleadoId = normalizeRequiredText(
      formData.get('supervisor_empleado_id'),
      'Supervisor'
    );
    const supervisor = await validarSupervisorActivo(service, supervisorEmpleadoId);

    const fechaEfectivaRaw = normalizeOptionalText(formData.get('fecha_efectiva'));
    const fechaEfectiva =
      fechaEfectivaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaEfectivaRaw)
        ? fechaEfectivaRaw
        : undefined;

    await sincronizarReasignacionSupervisorCascada(service as never, {
      pdvIds: [pdvId],
      nuevoSupervisorId: supervisorEmpleadoId,
      cuentaClienteId,
      usuarioId: actor.usuarioId,
      fechaEfectiva,
      motivo: `Actualización desde el catálogo administrativo de PDVs${fechaEfectiva ? ` (efectiva: ${fechaEfectiva})` : ''}`,
    });

    await registrarEventoAudit(service, actor.usuarioId, 'supervisor_pdv', pdvId, {
      evento: 'pdv_supervisor_actualizado_admin',
      supervisor_empleado_id: supervisorEmpleadoId,
      supervisor_nombre: supervisor.nombre_completo,
      fecha_efectiva: fechaEfectiva ?? null,
    });

    await publishPdvUiChanges(actor, service, {
      pdvId,
      eventType: 'pdv_supervisor_actualizado_admin',
      includeSupervisorConsumers: true,
    });
    await refreshPlaneacionPdv(service, cuentaClienteId, pdvId, false);
    return buildState({ ok: true, message: 'Supervisor del PDV actualizado.' });
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible actualizar el supervisor.',
    });
  }
}

export interface ReasignarSupervisoresMasivoInput {
  pdvIds: string[];
  nuevoSupervisorId: string;
  fechaEfectiva?: string;
}

export async function reasignarSupervisoresMasivoDesdeMapa(
  input: ReasignarSupervisoresMasivoInput
): Promise<{ ok: boolean; message: string; count?: number }> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);

  try {
    const { pdvIds, nuevoSupervisorId, fechaEfectiva } = input;
    if (!Array.isArray(pdvIds) || pdvIds.length === 0) {
      return { ok: false, message: 'Debes seleccionar al menos un punto de venta.' };
    }
    if (!nuevoSupervisorId) {
      return { ok: false, message: 'Debes seleccionar un supervisor válido.' };
    }

    const { service } = await getAdminService();
    const cuentaClienteId = resolveSingleTenantAccountId(actor.cuentaClienteId);
    const supervisor = await validarSupervisorActivo(service, nuevoSupervisorId);

    // 1. Ejecutar la cascada oficial (cuotas, asignaciones de dermos, snapshots) en lote con soporte de fecha efectiva
    await sincronizarReasignacionSupervisorCascada(service as never, {
      pdvIds,
      nuevoSupervisorId,
      cuentaClienteId,
      usuarioId: actor.usuarioId,
      fechaEfectiva,
      motivo: `Reasignación desde el Mapa Operacional (${pdvIds.length} tiendas)${fechaEfectiva ? ` con fecha efectiva ${fechaEfectiva}` : ''}`,
    });

    // 2. Auditoría, eventos UI y refresco de planeación por cada PDV
    for (const pdvId of pdvIds) {
      await registrarEventoAudit(service, actor.usuarioId, 'supervisor_pdv', pdvId, {
        evento: 'pdv_supervisor_actualizado_mapa',
        supervisor_empleado_id: nuevoSupervisorId,
        supervisor_nombre: supervisor.nombre_completo,
        fecha_efectiva: fechaEfectiva ?? null,
        total_tiendas_reasignadas: pdvIds.length,
      });

      await publishPdvUiChanges(actor, service, {
        pdvId,
        eventType: 'pdv_supervisor_actualizado_admin',
        includeSupervisorConsumers: true,
      });
      await refreshPlaneacionPdv(service, cuentaClienteId, pdvId, false);
    }

    try {
      revalidateTag('pdvs', 'max');
      revalidateTag('planeacion-mensual', 'max');
    } catch {
      // Ignorar en entornos sin Next cache tag
    }

    const fechaTexto = fechaEfectiva ? ` a partir del ${fechaEfectiva}` : '';
    return {
      ok: true,
      message: `Se ${pdvIds.length === 1 ? 'asignó 1 tienda' : `asignaron ${pdvIds.length} tiendas`} exitosamente a ${supervisor.nombre_completo}${fechaTexto}.`,
      count: pdvIds.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No fue posible reasignar las tiendas.',
    };
  }
}

