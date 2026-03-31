alter table if exists public.ruta_semanal
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_ruta_semanal_metadata_gin
on public.ruta_semanal
using gin (metadata);

create table if not exists public.ruta_agenda_evento (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  ruta_semanal_id uuid not null references public.ruta_semanal(id) on delete cascade,
  ruta_semanal_visita_id uuid references public.ruta_semanal_visita(id) on delete set null,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid references public.pdv(id) on delete set null,
  fecha_operacion date not null,
  tipo_evento text not null default 'OTRO',
  modo_impacto text not null default 'SUMA',
  estatus_aprobacion text not null default 'NO_REQUIERE',
  estatus_ejecucion text not null default 'PENDIENTE',
  titulo text not null default 'Evento operativo',
  descripcion text,
  sede text,
  hora_inicio time,
  hora_fin time,
  selfie_url text,
  selfie_hash text,
  evidencia_url text,
  evidencia_hash text,
  check_in_en timestamptz,
  check_out_en timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  resolved_by_usuario_id uuid references public.usuario(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ruta_agenda_evento
add column if not exists cuenta_cliente_id uuid references public.cuenta_cliente(id) on delete restrict;
alter table public.ruta_agenda_evento
add column if not exists ruta_semanal_id uuid references public.ruta_semanal(id) on delete cascade;
alter table public.ruta_agenda_evento
add column if not exists ruta_semanal_visita_id uuid references public.ruta_semanal_visita(id) on delete set null;
alter table public.ruta_agenda_evento
add column if not exists supervisor_empleado_id uuid references public.empleado(id) on delete restrict;
alter table public.ruta_agenda_evento
add column if not exists pdv_id uuid references public.pdv(id) on delete set null;
alter table public.ruta_agenda_evento
add column if not exists fecha_operacion date;
alter table public.ruta_agenda_evento
add column if not exists tipo_evento text not null default 'OTRO';
alter table public.ruta_agenda_evento
add column if not exists modo_impacto text not null default 'SUMA';
alter table public.ruta_agenda_evento
add column if not exists estatus_aprobacion text not null default 'NO_REQUIERE';
alter table public.ruta_agenda_evento
add column if not exists estatus_ejecucion text not null default 'PENDIENTE';
alter table public.ruta_agenda_evento
add column if not exists titulo text not null default 'Evento operativo';
alter table public.ruta_agenda_evento
add column if not exists descripcion text;
alter table public.ruta_agenda_evento
add column if not exists sede text;
alter table public.ruta_agenda_evento
add column if not exists hora_inicio time;
alter table public.ruta_agenda_evento
add column if not exists hora_fin time;
alter table public.ruta_agenda_evento
add column if not exists selfie_url text;
alter table public.ruta_agenda_evento
add column if not exists selfie_hash text;
alter table public.ruta_agenda_evento
add column if not exists evidencia_url text;
alter table public.ruta_agenda_evento
add column if not exists evidencia_hash text;
alter table public.ruta_agenda_evento
add column if not exists check_in_en timestamptz;
alter table public.ruta_agenda_evento
add column if not exists check_out_en timestamptz;
alter table public.ruta_agenda_evento
add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ruta_agenda_evento
add column if not exists created_by_usuario_id uuid references public.usuario(id) on delete set null;
alter table public.ruta_agenda_evento
add column if not exists resolved_by_usuario_id uuid references public.usuario(id) on delete set null;
alter table public.ruta_agenda_evento
add column if not exists resolved_at timestamptz;
alter table public.ruta_agenda_evento
add column if not exists created_at timestamptz not null default now();
alter table public.ruta_agenda_evento
add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ruta_agenda_evento_tipo_evento_check'
  ) then
    alter table public.ruta_agenda_evento
    add constraint ruta_agenda_evento_tipo_evento_check
    check (
      tipo_evento in (
        'VISITA_ADICIONAL',
        'OFICINA',
        'FIRMA_CONTRATO',
        'FORMACION',
        'ENTREGA_NUEVA_DC',
        'PRESENTACION_GERENTE',
        'VISITA_EMERGENCIA',
        'OTRO'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ruta_agenda_evento_modo_impacto_check'
  ) then
    alter table public.ruta_agenda_evento
    add constraint ruta_agenda_evento_modo_impacto_check
    check (modo_impacto in ('SUMA', 'SOBREPONE_PARCIAL', 'REEMPLAZA_TOTAL'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ruta_agenda_evento_estatus_aprobacion_check'
  ) then
    alter table public.ruta_agenda_evento
    add constraint ruta_agenda_evento_estatus_aprobacion_check
    check (estatus_aprobacion in ('NO_REQUIERE', 'PENDIENTE_COORDINACION', 'APROBADO', 'RECHAZADO'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ruta_agenda_evento_estatus_ejecucion_check'
  ) then
    alter table public.ruta_agenda_evento
    add constraint ruta_agenda_evento_estatus_ejecucion_check
    check (estatus_ejecucion in ('PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'CANCELADO'));
  end if;
end $$;

create index if not exists idx_ruta_agenda_evento_supervisor_fecha
on public.ruta_agenda_evento(supervisor_empleado_id, fecha_operacion desc);

create index if not exists idx_ruta_agenda_evento_ruta_fecha
on public.ruta_agenda_evento(ruta_semanal_id, fecha_operacion desc);

create index if not exists idx_ruta_agenda_evento_aprobacion
on public.ruta_agenda_evento(estatus_aprobacion, fecha_operacion desc);

create table if not exists public.ruta_visita_pendiente_reposicion (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  ruta_semanal_id uuid not null references public.ruta_semanal(id) on delete cascade,
  ruta_semanal_visita_id uuid not null references public.ruta_semanal_visita(id) on delete cascade,
  agenda_evento_id uuid references public.ruta_agenda_evento(id) on delete set null,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  fecha_origen date not null,
  semana_sugerida_inicio date,
  clasificacion text not null default 'INJUSTIFICADA',
  motivo text not null default 'Pendiente de reposicion',
  estado text not null default 'PENDIENTE',
  ruta_destino_id uuid references public.ruta_semanal(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ruta_visita_pendiente_reposicion
add column if not exists cuenta_cliente_id uuid references public.cuenta_cliente(id) on delete restrict;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists ruta_semanal_id uuid references public.ruta_semanal(id) on delete cascade;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists ruta_semanal_visita_id uuid references public.ruta_semanal_visita(id) on delete cascade;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists agenda_evento_id uuid references public.ruta_agenda_evento(id) on delete set null;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists supervisor_empleado_id uuid references public.empleado(id) on delete restrict;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists pdv_id uuid references public.pdv(id) on delete restrict;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists fecha_origen date;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists semana_sugerida_inicio date;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists clasificacion text not null default 'INJUSTIFICADA';
alter table public.ruta_visita_pendiente_reposicion
add column if not exists motivo text not null default 'Pendiente de reposicion';
alter table public.ruta_visita_pendiente_reposicion
add column if not exists estado text not null default 'PENDIENTE';
alter table public.ruta_visita_pendiente_reposicion
add column if not exists ruta_destino_id uuid references public.ruta_semanal(id) on delete set null;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ruta_visita_pendiente_reposicion
add column if not exists created_at timestamptz not null default now();
alter table public.ruta_visita_pendiente_reposicion
add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ruta_visita_pendiente_reposicion_clasificacion_check'
  ) then
    alter table public.ruta_visita_pendiente_reposicion
    add constraint ruta_visita_pendiente_reposicion_clasificacion_check
    check (clasificacion in ('JUSTIFICADA', 'INJUSTIFICADA'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ruta_visita_pendiente_reposicion_estado_check'
  ) then
    alter table public.ruta_visita_pendiente_reposicion
    add constraint ruta_visita_pendiente_reposicion_estado_check
    check (estado in ('PENDIENTE', 'REPROGRAMADA', 'DESCARTADA', 'EJECUTADA'));
  end if;
end $$;

create unique index if not exists idx_ruta_reposicion_visita_clasificacion_unique
on public.ruta_visita_pendiente_reposicion(ruta_semanal_visita_id, clasificacion);

create index if not exists idx_ruta_reposicion_supervisor_estado
on public.ruta_visita_pendiente_reposicion(supervisor_empleado_id, estado, fecha_origen desc);

create index if not exists idx_ruta_reposicion_semana_sugerida
on public.ruta_visita_pendiente_reposicion(semana_sugerida_inicio, estado);

alter table public.ruta_agenda_evento enable row level security;
alter table public.ruta_visita_pendiente_reposicion enable row level security;

drop policy if exists "ruta_agenda_evento_select_operacion" on public.ruta_agenda_evento;
create policy "ruta_agenda_evento_select_operacion"
on public.ruta_agenda_evento
for select
to authenticated
using (
  public.es_usuario_interno()
  and (
    public.es_administrador()
    or supervisor_empleado_id = public.get_my_empleado_id()
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

drop policy if exists "ruta_agenda_evento_insert_supervisor" on public.ruta_agenda_evento;
create policy "ruta_agenda_evento_insert_supervisor"
on public.ruta_agenda_evento
for insert
to authenticated
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

drop policy if exists "ruta_agenda_evento_update_supervisor" on public.ruta_agenda_evento;
create policy "ruta_agenda_evento_update_supervisor"
on public.ruta_agenda_evento
for update
to authenticated
using (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

drop policy if exists "ruta_reposicion_select_operacion" on public.ruta_visita_pendiente_reposicion;
create policy "ruta_reposicion_select_operacion"
on public.ruta_visita_pendiente_reposicion
for select
to authenticated
using (
  public.es_usuario_interno()
  and (
    public.es_administrador()
    or supervisor_empleado_id = public.get_my_empleado_id()
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

drop policy if exists "ruta_reposicion_insert_supervisor" on public.ruta_visita_pendiente_reposicion;
create policy "ruta_reposicion_insert_supervisor"
on public.ruta_visita_pendiente_reposicion
for insert
to authenticated
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

drop policy if exists "ruta_reposicion_update_supervisor" on public.ruta_visita_pendiente_reposicion;
create policy "ruta_reposicion_update_supervisor"
on public.ruta_visita_pendiente_reposicion
for update
to authenticated
using (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

do $$
begin
  if to_regprocedure('public.actualizar_updated_at()') is not null then
    execute 'drop trigger if exists trg_ruta_agenda_evento_updated_at on public.ruta_agenda_evento';
    execute 'create trigger trg_ruta_agenda_evento_updated_at before update on public.ruta_agenda_evento for each row execute function public.actualizar_updated_at()';

    execute 'drop trigger if exists trg_ruta_visita_pendiente_reposicion_updated_at on public.ruta_visita_pendiente_reposicion';
    execute 'create trigger trg_ruta_visita_pendiente_reposicion_updated_at before update on public.ruta_visita_pendiente_reposicion for each row execute function public.actualizar_updated_at()';
  end if;

  if to_regprocedure('public.audit_log_capture_row_change()') is not null then
    execute 'drop trigger if exists trg_ruta_agenda_evento_audit_log on public.ruta_agenda_evento';
    execute 'create trigger trg_ruta_agenda_evento_audit_log after insert or update or delete on public.ruta_agenda_evento for each row execute function public.audit_log_capture_row_change()';

    execute 'drop trigger if exists trg_ruta_visita_pendiente_reposicion_audit_log on public.ruta_visita_pendiente_reposicion';
    execute 'create trigger trg_ruta_visita_pendiente_reposicion_audit_log after insert or update or delete on public.ruta_visita_pendiente_reposicion for each row execute function public.audit_log_capture_row_change()';
  end if;
end $$;
