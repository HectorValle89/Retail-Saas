begin;

create table if not exists public.pdv_catalogo_lote (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  nombre_archivo text not null,
  hash_archivo text not null,
  fecha_efectiva date not null,
  estado text not null default 'PROGRAMADO'
    check (estado in ('PROGRAMADO', 'APLICADO', 'CANCELADO', 'ERROR')),
  total_filas integer not null default 0 check (total_filas >= 0),
  filas_nuevas integer not null default 0 check (filas_nuevas >= 0),
  filas_actualizadas integer not null default 0 check (filas_actualizadas >= 0),
  resumen jsonb not null default '{}'::jsonb,
  aplicado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, hash_archivo, fecha_efectiva)
);

create table if not exists public.pdv_detalle_vigencia (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  lote_id uuid references public.pdv_catalogo_lote(id) on delete set null,
  pdv_id uuid not null references public.pdv(id) on delete cascade,
  cadena_id uuid references public.cadena(id) on delete restrict,
  ciudad_id uuid references public.ciudad(id) on delete restrict,
  supervisor_empleado_id uuid references public.empleado(id) on delete restrict,
  id_cadena text,
  nombre text not null,
  direccion text,
  zona text,
  formato text,
  estatus text not null check (estatus in ('ACTIVO', 'TEMPORAL', 'INACTIVO')),
  latitud numeric(10,7),
  longitud numeric(10,7),
  radio_tolerancia_metros integer check (
    radio_tolerancia_metros is null or radio_tolerancia_metros between 1 and 1000
  ),
  tolerancia_minutos integer check (
    tolerancia_minutos is null or tolerancia_minutos between 0 and 1440
  ),
  dias_fuente text,
  descanso_fuente text,
  vigente_desde date not null,
  vigente_hasta date,
  fila_origen integer,
  metadata jsonb not null default '{}'::jsonb,
  aplicado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (latitud is null and longitud is null)
    or (latitud is not null and longitud is not null)
  ),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  unique (cuenta_cliente_id, pdv_id, vigente_desde)
);

create index if not exists idx_pdv_detalle_vigencia_resolucion
on public.pdv_detalle_vigencia (
  cuenta_cliente_id,
  pdv_id,
  vigente_desde desc,
  vigente_hasta
);

create index if not exists idx_pdv_detalle_vigencia_pendiente
on public.pdv_detalle_vigencia (vigente_desde, cuenta_cliente_id)
where aplicado_at is null;

drop trigger if exists trg_pdv_catalogo_lote_updated_at on public.pdv_catalogo_lote;
create trigger trg_pdv_catalogo_lote_updated_at
before update on public.pdv_catalogo_lote
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_pdv_detalle_vigencia_updated_at on public.pdv_detalle_vigencia;
create trigger trg_pdv_detalle_vigencia_updated_at
before update on public.pdv_detalle_vigencia
for each row execute function public.actualizar_updated_at();

alter table public.pdv_catalogo_lote enable row level security;
alter table public.pdv_detalle_vigencia enable row level security;

drop policy if exists "pdv_catalogo_lote_select_operacion" on public.pdv_catalogo_lote;
create policy "pdv_catalogo_lote_select_operacion"
on public.pdv_catalogo_lote
for select
to authenticated
using (
  public.es_usuario_interno()
  and (
    public.es_administrador()
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

drop policy if exists "pdv_detalle_vigencia_select_operacion" on public.pdv_detalle_vigencia;
create policy "pdv_detalle_vigencia_select_operacion"
on public.pdv_detalle_vigencia
for select
to authenticated
using (
  public.es_usuario_interno()
  and (
    public.es_administrador()
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

grant select on table public.pdv_catalogo_lote, public.pdv_detalle_vigencia to authenticated;
grant select, insert, update on table public.pdv_catalogo_lote, public.pdv_detalle_vigencia
  to service_role;
revoke insert, update, delete on table public.pdv_catalogo_lote, public.pdv_detalle_vigencia
  from authenticated;

create or replace function public.aplicar_pdv_detalles_vigentes(
  p_fecha date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_detalle record;
  v_aplicadas integer := 0;
begin
  for v_detalle in
    select detalle.*
    from public.pdv_detalle_vigencia detalle
    where detalle.aplicado_at is null
      and detalle.vigente_desde <= p_fecha
      and coalesce(detalle.vigente_hasta, '9999-12-31'::date) >= p_fecha
    order by detalle.vigente_desde, detalle.pdv_id
    for update skip locked
  loop
    update public.pdv
    set cadena_id = v_detalle.cadena_id,
        ciudad_id = v_detalle.ciudad_id,
        id_cadena = v_detalle.id_cadena,
        nombre = v_detalle.nombre,
        direccion = v_detalle.direccion,
        zona = v_detalle.zona,
        formato = v_detalle.formato,
        estatus = v_detalle.estatus,
        activo = v_detalle.estatus <> 'INACTIVO',
        metadata = coalesce(metadata, '{}'::jsonb)
          || coalesce(v_detalle.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'catalogo_vigente_desde', v_detalle.vigente_desde,
            'catalogo_lote_id', v_detalle.lote_id
          ),
        updated_at = now()
    where id = v_detalle.pdv_id;

    if v_detalle.latitud is not null and v_detalle.longitud is not null then
      insert into public.geocerca_pdv (
        pdv_id,
        latitud,
        longitud,
        radio_tolerancia_metros,
        permite_checkin_con_justificacion
      )
      values (
        v_detalle.pdv_id,
        v_detalle.latitud,
        v_detalle.longitud,
        coalesce(v_detalle.radio_tolerancia_metros, 100),
        true
      )
      on conflict (pdv_id) do update
      set latitud = excluded.latitud,
          longitud = excluded.longitud,
          radio_tolerancia_metros = excluded.radio_tolerancia_metros,
          updated_at = now();
    end if;

    update public.cuenta_cliente_pdv
    set activo = v_detalle.estatus <> 'INACTIVO',
        updated_at = now()
    where cuenta_cliente_id = v_detalle.cuenta_cliente_id
      and pdv_id = v_detalle.pdv_id
      and fecha_inicio <= p_fecha
      and coalesce(fecha_fin, '9999-12-31'::date) >= p_fecha;

    update public.pdv_detalle_vigencia
    set aplicado_at = now(), updated_at = now()
    where id = v_detalle.id;

    v_aplicadas := v_aplicadas + 1;
  end loop;

  update public.pdv_catalogo_lote lote
  set estado = 'APLICADO',
      aplicado_at = coalesce(lote.aplicado_at, now()),
      updated_at = now()
  where lote.estado = 'PROGRAMADO'
    and lote.fecha_efectiva <= p_fecha
    and not exists (
      select 1
      from public.pdv_detalle_vigencia detalle
      where detalle.lote_id = lote.id
        and detalle.aplicado_at is null
    );

  return v_aplicadas;
end;
$$;

create or replace function public.reconciliar_ruta_supervisor_pdv(
  p_cuenta_cliente_id uuid,
  p_pdv_id uuid,
  p_supervisor_origen_id uuid,
  p_supervisor_destino_id uuid,
  p_fecha_efectiva date,
  p_motivo text default 'REASIGNACION_SUPERVISOR_PDV'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visitas_canceladas integer := 0;
  v_eventos_cancelados integer := 0;
  v_cuota integer;
  v_mes date := date_trunc('month', p_fecha_efectiva)::date;
  v_siguiente date;
begin
  if p_supervisor_origen_id is null
    or p_supervisor_destino_id is null
    or p_supervisor_origen_id = p_supervisor_destino_id then
    return jsonb_build_object(
      'visitasCanceladas', 0,
      'eventosCancelados', 0,
      'cuotaTransferida', false
    );
  end if;

  update public.ruta_semanal_visita visita
  set estatus = 'CANCELADA',
      comentarios = concat_ws(
        E'\n',
        nullif(visita.comentarios, ''),
        'Cancelada por reasignación efectiva del PDV a partir de ' || p_fecha_efectiva::text
      ),
      metadata = coalesce(visita.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelacion_origen', p_motivo,
        'fecha_efectiva', p_fecha_efectiva,
        'supervisor_destino_id', p_supervisor_destino_id,
        'cancelada_at', now()
      ),
      updated_at = now()
  from public.ruta_semanal ruta
  where visita.ruta_semanal_id = ruta.id
    and visita.cuenta_cliente_id = p_cuenta_cliente_id
    and visita.pdv_id = p_pdv_id
    and visita.supervisor_empleado_id = p_supervisor_origen_id
    and visita.estatus = 'PLANIFICADA'
    and ruta.semana_inicio + (visita.dia_semana::integer - 1) >= p_fecha_efectiva;
  get diagnostics v_visitas_canceladas = row_count;

  update public.ruta_agenda_evento evento
  set estatus_ejecucion = 'CANCELADO',
      metadata = coalesce(evento.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelacion_origen', p_motivo,
        'fecha_efectiva', p_fecha_efectiva,
        'supervisor_destino_id', p_supervisor_destino_id,
        'cancelada_at', now()
      ),
      updated_at = now()
  where evento.cuenta_cliente_id = p_cuenta_cliente_id
    and evento.pdv_id = p_pdv_id
    and evento.supervisor_empleado_id = p_supervisor_origen_id
    and evento.fecha_operacion >= p_fecha_efectiva
    and evento.estatus_ejecucion = 'PENDIENTE';
  get diagnostics v_eventos_cancelados = row_count;

  if p_fecha_efectiva = v_mes then
    select cuota.visitas_mensuales
    into v_cuota
    from public.ruta_cuota_supervisor_pdv cuota
    where cuota.cuenta_cliente_id = p_cuenta_cliente_id
      and cuota.supervisor_empleado_id = p_supervisor_origen_id
      and cuota.pdv_id = p_pdv_id
      and cuota.vigente_desde <= v_mes
      and coalesce(cuota.vigente_hasta, '9999-12-31'::date) >= v_mes
    order by cuota.vigente_desde desc
    limit 1;

    if v_cuota is not null then
      update public.ruta_cuota_supervisor_pdv
      set vigente_hasta = v_mes - 1,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'cerrada_por', p_motivo,
            'supervisor_destino_id', p_supervisor_destino_id,
            'fecha_efectiva', p_fecha_efectiva
          ),
          updated_at = now()
      where cuenta_cliente_id = p_cuenta_cliente_id
        and supervisor_empleado_id = p_supervisor_origen_id
        and pdv_id = p_pdv_id
        and vigente_desde < v_mes
        and coalesce(vigente_hasta, '9999-12-31'::date) >= v_mes;

      select min(vigente_desde)
      into v_siguiente
      from public.ruta_cuota_supervisor_pdv
      where cuenta_cliente_id = p_cuenta_cliente_id
        and supervisor_empleado_id = p_supervisor_destino_id
        and pdv_id = p_pdv_id
        and vigente_desde > v_mes;

      insert into public.ruta_cuota_supervisor_pdv (
        cuenta_cliente_id,
        supervisor_empleado_id,
        pdv_id,
        visitas_mensuales,
        vigente_desde,
        vigente_hasta,
        metadata
      )
      values (
        p_cuenta_cliente_id,
        p_supervisor_destino_id,
        p_pdv_id,
        v_cuota,
        v_mes,
        case when v_siguiente is null then null else v_siguiente - 1 end,
        jsonb_build_object(
          'origen', p_motivo,
          'supervisor_origen_id', p_supervisor_origen_id,
          'fecha_efectiva', p_fecha_efectiva
        )
      )
      on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
      do nothing;
    end if;
  end if;

  insert into public.audit_log (
    tabla,
    registro_id,
    accion,
    payload,
    cuenta_cliente_id
  )
  values (
    'supervisor_pdv',
    p_pdv_id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', 'ruta_reconciliada_por_reasignacion_supervisor',
      'supervisor_origen_id', p_supervisor_origen_id,
      'supervisor_destino_id', p_supervisor_destino_id,
      'fecha_efectiva', p_fecha_efectiva,
      'visitas_canceladas', v_visitas_canceladas,
      'eventos_cancelados', v_eventos_cancelados,
      'cuota_transferida', v_cuota is not null and p_fecha_efectiva = v_mes,
      'motivo', p_motivo
    ),
    p_cuenta_cliente_id
  );

  return jsonb_build_object(
    'visitasCanceladas', v_visitas_canceladas,
    'eventosCancelados', v_eventos_cancelados,
    'cuotaTransferida', v_cuota is not null and p_fecha_efectiva = v_mes
  );
end;
$$;

create or replace function public.trg_reconciliar_ruta_supervisor_pdv()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supervisor_origen_id uuid;
  v_cuenta_cliente_id uuid;
begin
  if not new.activo then
    return new;
  end if;

  select relacion.empleado_id
  into v_supervisor_origen_id
  from public.supervisor_pdv relacion
  where relacion.pdv_id = new.pdv_id
    and relacion.id <> new.id
    and relacion.activo
    and relacion.empleado_id <> new.empleado_id
    and relacion.fecha_inicio <= new.fecha_inicio - 1
    and coalesce(relacion.fecha_fin, '9999-12-31'::date) >= new.fecha_inicio - 1
  order by relacion.fecha_inicio desc
  limit 1;

  if v_supervisor_origen_id is null then
    return new;
  end if;

  select relacion.cuenta_cliente_id
  into v_cuenta_cliente_id
  from public.cuenta_cliente_pdv relacion
  where relacion.pdv_id = new.pdv_id
    and relacion.fecha_inicio <= new.fecha_inicio
    and coalesce(relacion.fecha_fin, '9999-12-31'::date) >= new.fecha_inicio
  order by relacion.fecha_inicio desc
  limit 1;

  if v_cuenta_cliente_id is not null then
    perform public.reconciliar_ruta_supervisor_pdv(
      v_cuenta_cliente_id,
      new.pdv_id,
      v_supervisor_origen_id,
      new.empleado_id,
      new.fecha_inicio,
      'TRIGGER_SUPERVISOR_PDV'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_supervisor_pdv_reconciliar_ruta on public.supervisor_pdv;
create trigger trg_supervisor_pdv_reconciliar_ruta
after insert or update of empleado_id, activo, fecha_inicio
on public.supervisor_pdv
for each row execute function public.trg_reconciliar_ruta_supervisor_pdv();

revoke all on function public.aplicar_pdv_detalles_vigentes(date)
  from public, anon, authenticated;
revoke all on function public.reconciliar_ruta_supervisor_pdv(
  uuid, uuid, uuid, uuid, date, text
) from public, anon, authenticated;
grant execute on function public.aplicar_pdv_detalles_vigentes(date) to service_role;
grant execute on function public.reconciliar_ruta_supervisor_pdv(
  uuid, uuid, uuid, uuid, date, text
) to service_role;

comment on table public.pdv_detalle_vigencia is
  'Version completa del detalle maestro de un PDV, efectiva por rango y aplicable sin sobrescribir el periodo anterior.';
comment on function public.aplicar_pdv_detalles_vigentes(date) is
  'Publica las versiones programadas del catalogo PDV cuya fecha efectiva ya inicio.';
comment on function public.reconciliar_ruta_supervisor_pdv(uuid, uuid, uuid, uuid, date, text) is
  'Cancela solo agenda futura no ejecutada del supervisor saliente y transfiere la cuota mensual cuando el cambio inicia el primer dia del mes.';

-- Repara reasignaciones futuras ya registradas antes de existir la cascada de rutas.
do $$
declare
  v_relacion record;
  v_supervisor_origen_id uuid;
  v_cuenta_cliente_id uuid;
begin
  for v_relacion in
    select relacion.*
    from public.supervisor_pdv relacion
    where relacion.activo
      and relacion.fecha_inicio >= current_date
    order by relacion.fecha_inicio, relacion.pdv_id
  loop
    select anterior.empleado_id
    into v_supervisor_origen_id
    from public.supervisor_pdv anterior
    where anterior.pdv_id = v_relacion.pdv_id
      and anterior.id <> v_relacion.id
      and anterior.activo
      and anterior.empleado_id <> v_relacion.empleado_id
      and anterior.fecha_inicio <= v_relacion.fecha_inicio - 1
      and coalesce(anterior.fecha_fin, '9999-12-31'::date) >= v_relacion.fecha_inicio - 1
    order by anterior.fecha_inicio desc
    limit 1;

    select cuenta.cuenta_cliente_id
    into v_cuenta_cliente_id
    from public.cuenta_cliente_pdv cuenta
    where cuenta.pdv_id = v_relacion.pdv_id
      and cuenta.fecha_inicio <= v_relacion.fecha_inicio
      and coalesce(cuenta.fecha_fin, '9999-12-31'::date) >= v_relacion.fecha_inicio
    order by cuenta.fecha_inicio desc
    limit 1;

    if v_supervisor_origen_id is not null and v_cuenta_cliente_id is not null then
      perform public.reconciliar_ruta_supervisor_pdv(
        v_cuenta_cliente_id,
        v_relacion.pdv_id,
        v_supervisor_origen_id,
        v_relacion.empleado_id,
        v_relacion.fecha_inicio,
        'BACKFILL_SUPERVISOR_PDV'
      );
    end if;
  end loop;
end;
$$;

commit;
