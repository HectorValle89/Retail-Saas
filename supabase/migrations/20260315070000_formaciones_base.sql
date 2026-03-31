create table if not exists public.formacion_evento (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  nombre text not null,
  descripcion text,
  sede text not null,
  ciudad text,
  tipo text not null default 'GENERAL',
  responsable_empleado_id uuid references public.empleado(id) on delete set null,
  fecha_inicio date not null,
  fecha_fin date not null check (fecha_fin >= fecha_inicio),
  estado text not null default 'BORRADOR' check (
    estado in ('BORRADOR', 'PROGRAMADA', 'CERRADA', 'CANCELADA')
  ),
  participantes jsonb not null default '[]'::jsonb,
  gastos_operativos jsonb not null default '[]'::jsonb,
  notificaciones jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  updated_by_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_formacion_evento_cuenta_fecha
on public.formacion_evento(cuenta_cliente_id, fecha_inicio desc, fecha_fin desc);

create index if not exists idx_formacion_evento_estado
on public.formacion_evento(estado, fecha_inicio desc);

create trigger trg_formacion_evento_updated_at
before update on public.formacion_evento
for each row execute function public.actualizar_updated_at();

create table if not exists public.formacion_asistencia (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.formacion_evento(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  participante_nombre text not null,
  puesto text,
  confirmado boolean not null default false,
  presente boolean not null default false,
  estado text not null default 'PENDIENTE' check (
    estado in ('PENDIENTE', 'CONFIRMADO', 'FALTANTE', 'JUSTIFICADO')
  ),
  evidencias jsonb not null default '[]'::jsonb,
  comentarios text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_formacion_asistencia_evento
on public.formacion_asistencia(evento_id, cuenta_cliente_id);

create index if not exists idx_formacion_asistencia_empleado
on public.formacion_asistencia(empleado_id, cuenta_cliente_id);

create trigger trg_formacion_asistencia_updated_at
before update on public.formacion_asistencia
for each row execute function public.actualizar_updated_at();

alter table public.formacion_evento enable row level security;
alter table public.formacion_asistencia enable row level security;

create policy "formacion_evento_select_operacion"
on public.formacion_evento
for select
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS', 'DERMOCONSEJERO'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "formacion_evento_insert_operacion"
on public.formacion_evento
for insert
to authenticated
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "formacion_evento_update_operacion"
on public.formacion_evento
for update
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
)
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "formacion_evento_delete_operacion"
on public.formacion_evento
for delete
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "formacion_asistencia_select_operacion"
on public.formacion_asistencia
for select
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS', 'DERMOCONSEJERO'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "formacion_asistencia_insert_operacion"
on public.formacion_asistencia
for insert
to authenticated
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "formacion_asistencia_update_operacion"
on public.formacion_asistencia
for update
to authenticated
using (
  (
    public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS'])
    or (public.get_my_role() = 'DERMOCONSEJERO' and empleado_id = public.get_my_empleado_id())
  )
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
)
with check (
  (
    public.get_my_role() = any (array['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'RECLUTAMIENTO', 'LOVE_IS', 'VENTAS'])
    or (public.get_my_role() = 'DERMOCONSEJERO' and empleado_id = public.get_my_empleado_id())
  )
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);