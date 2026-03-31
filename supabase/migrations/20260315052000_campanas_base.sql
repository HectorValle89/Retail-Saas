create table if not exists public.campana (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  cadena_id uuid references public.cadena(id) on delete set null,
  nombre text not null,
  descripcion text,
  fecha_inicio date not null,
  fecha_fin date not null check (fecha_fin >= fecha_inicio),
  estado text not null default 'BORRADOR' check (
    estado in ('BORRADOR', 'ACTIVA', 'CERRADA', 'CANCELADA')
  ),
  productos_foco jsonb not null default '[]'::jsonb,
  cuota_adicional numeric(12,2) not null default 0,
  instrucciones text,
  evidencias_requeridas jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  updated_by_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campana_cuenta_fechas
on public.campana(cuenta_cliente_id, fecha_inicio desc, fecha_fin desc);

create index if not exists idx_campana_estado
on public.campana(estado, fecha_inicio desc);

create trigger trg_campana_updated_at
before update on public.campana
for each row execute function public.actualizar_updated_at();

create table if not exists public.campana_pdv (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  dc_empleado_id uuid references public.empleado(id) on delete set null,
  tareas_requeridas jsonb not null default '[]'::jsonb,
  tareas_cumplidas jsonb not null default '[]'::jsonb,
  estatus_cumplimiento text not null default 'PENDIENTE' check (
    estatus_cumplimiento in ('PENDIENTE', 'EN_PROGRESO', 'CUMPLIDA', 'INCUMPLIDA')
  ),
  avance_porcentaje numeric(5,2) not null default 0 check (
    avance_porcentaje >= 0 and avance_porcentaje <= 100
  ),
  evidencias_cargadas integer not null default 0 check (evidencias_cargadas >= 0),
  comentarios text,
  metadata jsonb not null default '{}'::jsonb,
  updated_by_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campana_id, pdv_id)
);

create index if not exists idx_campana_pdv_campana
on public.campana_pdv(campana_id, estatus_cumplimiento);

create index if not exists idx_campana_pdv_cuenta_pdv
on public.campana_pdv(cuenta_cliente_id, pdv_id);

create index if not exists idx_campana_pdv_dc
on public.campana_pdv(dc_empleado_id);

create trigger trg_campana_pdv_updated_at
before update on public.campana_pdv
for each row execute function public.actualizar_updated_at();

alter table public.campana enable row level security;
alter table public.campana_pdv enable row level security;

create policy "campana_select_operacion"
on public.campana
for select
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA', 'DERMOCONSEJERO', 'CLIENTE'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_insert_manager"
on public.campana
for insert
to authenticated
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_update_manager"
on public.campana
for update
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
)
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_delete_manager"
on public.campana
for delete
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_pdv_select_operacion"
on public.campana_pdv
for select
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA', 'DERMOCONSEJERO', 'CLIENTE'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_pdv_insert_manager"
on public.campana_pdv
for insert
to authenticated
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_pdv_update_manager"
on public.campana_pdv
for update
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
)
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_pdv_delete_manager"
on public.campana_pdv
for delete
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);