-- =====================================================
-- Fase 5 - Logistica de ultima milla de materiales
-- Objetivo:
--   agregar una capa transaccional offline-first para que
--   SUPERVISOR registre entrega real a DC en PDV, con
--   discrepancias, evidencias, GPS e impacto idempotente
--   en inventario.
-- =====================================================

create table if not exists public.material_entrega_ultima_milla (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  distribucion_id uuid not null references public.material_distribucion_mensual(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  cadena_id uuid references public.cadena(id) on delete set null,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  dermoconsejero_empleado_id uuid references public.empleado(id) on delete set null,
  estado text not null default 'SINCRONIZADA' check (
    estado in (
      'BORRADOR_LOCAL',
      'PENDIENTE_SYNC',
      'SINCRONIZADA',
      'CON_DISCREPANCIA',
      'REQUIERE_REVISION',
      'CANCELADA'
    )
  ),
  pdv_snapshot jsonb not null default '{}'::jsonb,
  cadena_snapshot jsonb not null default '{}'::jsonb,
  dermoconsejero_snapshot jsonb not null default '{}'::jsonb,
  correccion_solicitada jsonb not null default '{}'::jsonb,
  latitud numeric,
  longitud numeric,
  gps_accuracy_metros numeric,
  capturado_en timestamptz not null default now(),
  sincronizado_en timestamptz,
  offline_client_id text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_entrega_ultima_milla_detalle (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.material_entrega_ultima_milla(id) on delete cascade,
  distribucion_detalle_id uuid not null references public.material_distribucion_detalle(id) on delete restrict,
  material_catalogo_id uuid not null references public.material_catalogo(id) on delete restrict,
  cantidad_teorica integer not null check (cantidad_teorica >= 0),
  estado_item text not null check (estado_item in ('COMPLETO', 'CON_DISCREPANCIA')),
  cantidad_real_recibida integer check (cantidad_real_recibida is null or cantidad_real_recibida >= 0),
  diferencia integer generated always as (coalesce(cantidad_real_recibida, cantidad_teorica) - cantidad_teorica) stored,
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entrega_id, distribucion_detalle_id)
);

create table if not exists public.material_entrega_ultima_milla_evidencia (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.material_entrega_ultima_milla(id) on delete cascade,
  tipo text not null check (tipo in ('ENTREGA_FISICA', 'ACUSE_FIRMADO')),
  archivo_hash_id uuid references public.archivo_hash(id) on delete set null,
  bucket text,
  ruta_archivo text,
  thumbnail_url text,
  capturada_en timestamptz not null default now(),
  latitud numeric,
  longitud numeric,
  gps_accuracy_metros numeric,
  orden integer not null default 1 check (orden > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_ultima_milla_cuenta_fecha
on public.material_entrega_ultima_milla(cuenta_cliente_id, capturado_en desc);

create index if not exists idx_material_ultima_milla_supervisor_fecha
on public.material_entrega_ultima_milla(supervisor_empleado_id, capturado_en desc);

create index if not exists idx_material_ultima_milla_pdv_fecha
on public.material_entrega_ultima_milla(pdv_id, capturado_en desc);

create index if not exists idx_material_ultima_milla_distribucion
on public.material_entrega_ultima_milla(distribucion_id);

create index if not exists idx_material_ultima_milla_detalle_entrega
on public.material_entrega_ultima_milla_detalle(entrega_id);

create index if not exists idx_material_ultima_milla_evidencia_entrega_tipo
on public.material_entrega_ultima_milla_evidencia(entrega_id, tipo);

drop trigger if exists trg_material_entrega_ultima_milla_updated_at on public.material_entrega_ultima_milla;
create trigger trg_material_entrega_ultima_milla_updated_at
before update on public.material_entrega_ultima_milla
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_entrega_ultima_milla_detalle_updated_at on public.material_entrega_ultima_milla_detalle;
create trigger trg_material_entrega_ultima_milla_detalle_updated_at
before update on public.material_entrega_ultima_milla_detalle
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_entrega_ultima_milla_evidencia_updated_at on public.material_entrega_ultima_milla_evidencia;
create trigger trg_material_entrega_ultima_milla_evidencia_updated_at
before update on public.material_entrega_ultima_milla_evidencia
for each row execute function public.actualizar_updated_at();

alter table public.material_entrega_ultima_milla enable row level security;
alter table public.material_entrega_ultima_milla_detalle enable row level security;
alter table public.material_entrega_ultima_milla_evidencia enable row level security;

drop policy if exists "material_ultima_milla_select_base" on public.material_entrega_ultima_milla;
create policy "material_ultima_milla_select_base"
on public.material_entrega_ultima_milla
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_ultima_milla_write_operacion" on public.material_entrega_ultima_milla;
create policy "material_ultima_milla_write_operacion"
on public.material_entrega_ultima_milla
for all
to authenticated
using (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
  or supervisor_empleado_id = public.get_my_empleado_id()
);

drop policy if exists "material_ultima_milla_detalle_select_base" on public.material_entrega_ultima_milla_detalle;
create policy "material_ultima_milla_detalle_select_base"
on public.material_entrega_ultima_milla_detalle
for select
to authenticated
using (
  exists (
    select 1
    from public.material_entrega_ultima_milla entrega
    where entrega.id = material_entrega_ultima_milla_detalle.entrega_id
      and (
        public.es_usuario_interno()
        or (public.es_cliente() and entrega.cuenta_cliente_id = public.get_my_cuenta_cliente_id())
      )
  )
);

drop policy if exists "material_ultima_milla_detalle_write_operacion" on public.material_entrega_ultima_milla_detalle;
create policy "material_ultima_milla_detalle_write_operacion"
on public.material_entrega_ultima_milla_detalle
for all
to authenticated
using (
  exists (
    select 1
    from public.material_entrega_ultima_milla entrega
    where entrega.id = material_entrega_ultima_milla_detalle.entrega_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or entrega.supervisor_empleado_id = public.get_my_empleado_id()
      )
  )
)
with check (
  exists (
    select 1
    from public.material_entrega_ultima_milla entrega
    where entrega.id = material_entrega_ultima_milla_detalle.entrega_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or entrega.supervisor_empleado_id = public.get_my_empleado_id()
      )
  )
);

drop policy if exists "material_ultima_milla_evidencia_select_base" on public.material_entrega_ultima_milla_evidencia;
create policy "material_ultima_milla_evidencia_select_base"
on public.material_entrega_ultima_milla_evidencia
for select
to authenticated
using (
  exists (
    select 1
    from public.material_entrega_ultima_milla entrega
    where entrega.id = material_entrega_ultima_milla_evidencia.entrega_id
      and (
        public.es_usuario_interno()
        or (public.es_cliente() and entrega.cuenta_cliente_id = public.get_my_cuenta_cliente_id())
      )
  )
);

drop policy if exists "material_ultima_milla_evidencia_write_operacion" on public.material_entrega_ultima_milla_evidencia;
create policy "material_ultima_milla_evidencia_write_operacion"
on public.material_entrega_ultima_milla_evidencia
for all
to authenticated
using (
  exists (
    select 1
    from public.material_entrega_ultima_milla entrega
    where entrega.id = material_entrega_ultima_milla_evidencia.entrega_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or entrega.supervisor_empleado_id = public.get_my_empleado_id()
      )
  )
)
with check (
  exists (
    select 1
    from public.material_entrega_ultima_milla entrega
    where entrega.id = material_entrega_ultima_milla_evidencia.entrega_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or entrega.supervisor_empleado_id = public.get_my_empleado_id()
      )
  )
);

drop trigger if exists trg_material_entrega_ultima_milla_audit_log on public.material_entrega_ultima_milla;
create trigger trg_material_entrega_ultima_milla_audit_log
after insert or update or delete on public.material_entrega_ultima_milla
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_entrega_ultima_milla_detalle_audit_log on public.material_entrega_ultima_milla_detalle;
create trigger trg_material_entrega_ultima_milla_detalle_audit_log
after insert or update or delete on public.material_entrega_ultima_milla_detalle
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_entrega_ultima_milla_evidencia_audit_log on public.material_entrega_ultima_milla_evidencia;
create trigger trg_material_entrega_ultima_milla_evidencia_audit_log
after insert or update or delete on public.material_entrega_ultima_milla_evidencia
for each row execute function public.audit_log_capture_row_change();

create or replace function public.rpc_registrar_entrega_ultima_milla(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entrega_id uuid;
  v_existing_id uuid;
  v_estado text := 'SINCRONIZADA';
  v_has_discrepancy boolean := false;
  v_detail jsonb;
  v_evidence jsonb;
  v_real integer;
  v_distribution_id uuid;
  v_lote_id uuid;
begin
  v_entrega_id := coalesce((p_datos->>'id')::uuid, gen_random_uuid());

  select id into v_existing_id
  from public.material_entrega_ultima_milla
  where offline_client_id = p_datos->>'offline_client_id';

  if v_existing_id is not null then
    return jsonb_build_object('ok', true, 'id', v_existing_id, 'inserted', false);
  end if;

  if jsonb_array_length(coalesce(p_datos->'detalles', '[]'::jsonb)) = 0 then
    raise exception 'La entrega no contiene detalle de materiales.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(p_datos->'evidencias', '[]'::jsonb)) evidencia
    where evidencia->>'tipo' = 'ENTREGA_FISICA'
  ) then
    raise exception 'La evidencia de entrega fisica es obligatoria.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(p_datos->'evidencias', '[]'::jsonb)) evidencia
    where evidencia->>'tipo' = 'ACUSE_FIRMADO'
  ) then
    raise exception 'Al menos un acuse firmado es obligatorio.';
  end if;

  select id, lote_id
  into v_distribution_id, v_lote_id
  from public.material_distribucion_mensual
  where id = (p_datos->>'distribucion_id')::uuid
  for update;

  if v_distribution_id is null then
    raise exception 'No existe la distribucion mensual indicada.';
  end if;

  for v_detail in select * from jsonb_array_elements(p_datos->'detalles') loop
    v_real := coalesce((v_detail->>'cantidad_real_recibida')::integer, (v_detail->>'cantidad_teorica')::integer);

    if v_detail->>'estado_item' = 'CON_DISCREPANCIA' and v_detail->>'cantidad_real_recibida' is null then
      raise exception 'La cantidad real es obligatoria cuando existe discrepancia.';
    end if;

    if v_detail->>'estado_item' = 'CON_DISCREPANCIA' or v_real <> (v_detail->>'cantidad_teorica')::integer then
      v_has_discrepancy := true;
    end if;
  end loop;

  if v_has_discrepancy then
    v_estado := 'CON_DISCREPANCIA';
  end if;

  insert into public.material_entrega_ultima_milla (
    id,
    cuenta_cliente_id,
    distribucion_id,
    pdv_id,
    cadena_id,
    supervisor_empleado_id,
    dermoconsejero_empleado_id,
    estado,
    pdv_snapshot,
    cadena_snapshot,
    dermoconsejero_snapshot,
    correccion_solicitada,
    latitud,
    longitud,
    gps_accuracy_metros,
    capturado_en,
    sincronizado_en,
    offline_client_id,
    metadata
  ) values (
    v_entrega_id,
    (p_datos->>'cuenta_cliente_id')::uuid,
    (p_datos->>'distribucion_id')::uuid,
    (p_datos->>'pdv_id')::uuid,
    nullif(p_datos->>'cadena_id', '')::uuid,
    (p_datos->>'supervisor_empleado_id')::uuid,
    nullif(p_datos->>'dermoconsejero_empleado_id', '')::uuid,
    v_estado,
    coalesce(p_datos->'pdv_snapshot', '{}'::jsonb),
    coalesce(p_datos->'cadena_snapshot', '{}'::jsonb),
    coalesce(p_datos->'dermoconsejero_snapshot', '{}'::jsonb),
    coalesce(p_datos->'correccion_solicitada', '{}'::jsonb),
    nullif(p_datos->>'latitud', '')::numeric,
    nullif(p_datos->>'longitud', '')::numeric,
    nullif(p_datos->>'gps_accuracy_metros', '')::numeric,
    coalesce((p_datos->>'capturado_en')::timestamptz, now()),
    now(),
    p_datos->>'offline_client_id',
    coalesce(p_datos->'metadata', '{}'::jsonb)
  );

  for v_detail in select * from jsonb_array_elements(p_datos->'detalles') loop
    v_real := coalesce((v_detail->>'cantidad_real_recibida')::integer, (v_detail->>'cantidad_teorica')::integer);

    insert into public.material_entrega_ultima_milla_detalle (
      entrega_id,
      distribucion_detalle_id,
      material_catalogo_id,
      cantidad_teorica,
      estado_item,
      cantidad_real_recibida,
      observaciones,
      metadata
    ) values (
      v_entrega_id,
      (v_detail->>'distribucion_detalle_id')::uuid,
      (v_detail->>'material_catalogo_id')::uuid,
      (v_detail->>'cantidad_teorica')::integer,
      v_detail->>'estado_item',
      v_real,
      nullif(v_detail->>'observaciones', ''),
      coalesce(v_detail->'metadata', '{}'::jsonb)
    );

    update public.material_distribucion_detalle
    set cantidad_recibida = v_real,
        cantidad_observada = abs(v_real - (v_detail->>'cantidad_teorica')::integer),
        observaciones = coalesce(nullif(v_detail->>'observaciones', ''), observaciones),
        metadata = metadata || jsonb_build_object(
          'ultima_milla_entrega_id', v_entrega_id,
          'ultima_milla_offline_client_id', p_datos->>'offline_client_id'
        )
    where id = (v_detail->>'distribucion_detalle_id')::uuid;

    if v_real > 0 then
      insert into public.material_inventario_movimiento (
        cuenta_cliente_id,
        pdv_id,
        material_catalogo_id,
        lote_id,
        distribucion_id,
        distribucion_detalle_id,
        empleado_id,
        tipo_movimiento,
        sentido,
        cantidad,
        cantidad_delta,
        motivo,
        observaciones,
        metadata
      ) values (
        (p_datos->>'cuenta_cliente_id')::uuid,
        (p_datos->>'pdv_id')::uuid,
        (v_detail->>'material_catalogo_id')::uuid,
        v_lote_id,
        (p_datos->>'distribucion_id')::uuid,
        (v_detail->>'distribucion_detalle_id')::uuid,
        (p_datos->>'supervisor_empleado_id')::uuid,
        'RECEPCION_LOTE',
        'ENTRADA',
        v_real,
        v_real,
        'Entrega ultima milla',
        nullif(v_detail->>'observaciones', ''),
        jsonb_build_object(
          'ultima_milla_entrega_id', v_entrega_id,
          'offline_client_id', p_datos->>'offline_client_id',
          'cantidad_teorica', (v_detail->>'cantidad_teorica')::integer
        )
      );
    end if;
  end loop;

  for v_evidence in select * from jsonb_array_elements(p_datos->'evidencias') loop
    insert into public.material_entrega_ultima_milla_evidencia (
      entrega_id,
      tipo,
      archivo_hash_id,
      bucket,
      ruta_archivo,
      thumbnail_url,
      capturada_en,
      latitud,
      longitud,
      gps_accuracy_metros,
      orden,
      metadata
    ) values (
      v_entrega_id,
      v_evidence->>'tipo',
      nullif(v_evidence->>'archivo_hash_id', '')::uuid,
      nullif(v_evidence->>'bucket', ''),
      nullif(v_evidence->>'ruta_archivo', ''),
      nullif(v_evidence->>'thumbnail_url', ''),
      coalesce((v_evidence->>'capturada_en')::timestamptz, now()),
      nullif(v_evidence->>'latitud', '')::numeric,
      nullif(v_evidence->>'longitud', '')::numeric,
      nullif(v_evidence->>'gps_accuracy_metros', '')::numeric,
      coalesce((v_evidence->>'orden')::integer, 1),
      coalesce(v_evidence->'metadata', '{}'::jsonb)
    );
  end loop;

  update public.material_distribucion_mensual
  set estado = case when v_has_discrepancy then 'RECIBIDA_CON_OBSERVACIONES' else 'RECIBIDA_CONFORME' end,
      confirmado_por_empleado_id = (p_datos->>'supervisor_empleado_id')::uuid,
      confirmado_en = now(),
      observaciones = coalesce(nullif(p_datos->>'observaciones', ''), observaciones),
      metadata = metadata || jsonb_build_object(
        'ultima_milla_entrega_id', v_entrega_id,
        'ultima_milla_estado', v_estado
      )
  where id = (p_datos->>'distribucion_id')::uuid;

  return jsonb_build_object(
    'ok', true,
    'id', v_entrega_id,
    'inserted', true,
    'estado', v_estado
  );
end;
$$;
