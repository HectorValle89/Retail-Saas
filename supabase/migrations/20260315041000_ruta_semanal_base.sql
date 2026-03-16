create table if not exists public.ruta_semanal (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  semana_inicio date not null,
  estatus text not null default 'BORRADOR' check (
    estatus in ('BORRADOR', 'PUBLICADA', 'EN_PROGRESO', 'CERRADA')
  ),
  notas text,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  updated_by_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supervisor_empleado_id, semana_inicio)
);

create index if not exists idx_ruta_semanal_supervisor_semana
on public.ruta_semanal(supervisor_empleado_id, semana_inicio desc);

create index if not exists idx_ruta_semanal_cuenta_semana
on public.ruta_semanal(cuenta_cliente_id, semana_inicio desc);

create trigger trg_ruta_semanal_updated_at
before update on public.ruta_semanal
for each row execute function public.actualizar_updated_at();

create table if not exists public.ruta_semanal_visita (
  id uuid primary key default gen_random_uuid(),
  ruta_semanal_id uuid not null references public.ruta_semanal(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  asignacion_id uuid references public.asignacion(id) on delete set null,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  orden smallint not null check (orden between 1 and 99),
  estatus text not null default 'PLANIFICADA' check (
    estatus in ('PLANIFICADA', 'COMPLETADA', 'CANCELADA')
  ),
  selfie_url text,
  selfie_hash text,
  evidencia_url text,
  evidencia_hash text,
  checklist_calidad jsonb not null default '{}'::jsonb,
  comentarios text,
  completada_en timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ruta_semanal_id, dia_semana, orden),
  unique (ruta_semanal_id, dia_semana, pdv_id)
);

create index if not exists idx_ruta_visita_ruta_dia_orden
on public.ruta_semanal_visita(ruta_semanal_id, dia_semana, orden);

create index if not exists idx_ruta_visita_supervisor_estatus
on public.ruta_semanal_visita(supervisor_empleado_id, estatus, dia_semana);

create trigger trg_ruta_semanal_visita_updated_at
before update on public.ruta_semanal_visita
for each row execute function public.actualizar_updated_at();

alter table public.ruta_semanal enable row level security;
alter table public.ruta_semanal_visita enable row level security;

create policy "ruta_semanal_select_operacion"
on public.ruta_semanal
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

create policy "ruta_semanal_insert_supervisor"
on public.ruta_semanal
for insert
to authenticated
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

create policy "ruta_semanal_update_supervisor"
on public.ruta_semanal
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

create policy "ruta_semanal_visita_select_operacion"
on public.ruta_semanal_visita
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

create policy "ruta_semanal_visita_insert_supervisor"
on public.ruta_semanal_visita
for insert
to authenticated
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

create policy "ruta_semanal_visita_update_supervisor"
on public.ruta_semanal_visita
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