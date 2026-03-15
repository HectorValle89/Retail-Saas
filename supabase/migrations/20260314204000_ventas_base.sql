create table if not exists public.venta (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  asistencia_id uuid not null references public.asistencia(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  producto_id uuid references public.producto(id) on delete set null,
  producto_sku text,
  producto_nombre text not null,
  producto_nombre_corto text,
  fecha_utc timestamptz not null default now(),
  total_unidades integer not null check (total_unidades > 0),
  total_monto numeric(12,2) not null default 0 check (total_monto >= 0),
  confirmada boolean not null default false,
  validada_por_empleado_id uuid references public.empleado(id) on delete set null,
  validada_en timestamptz,
  observaciones text,
  origen text not null default 'ONLINE' check (
    origen in ('ONLINE', 'OFFLINE_SYNC', 'AJUSTE_ADMIN')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_venta_cuenta_fecha
on public.venta(cuenta_cliente_id, fecha_utc desc);

create index if not exists idx_venta_asistencia
on public.venta(asistencia_id);

create index if not exists idx_venta_empleado_fecha
on public.venta(empleado_id, fecha_utc desc);

create index if not exists idx_venta_producto
on public.venta(producto_id, fecha_utc desc);

create trigger trg_venta_updated_at
before update on public.venta
for each row execute function public.actualizar_updated_at();

create or replace function public.validar_venta_con_asistencia_base()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_asistencia public.asistencia%rowtype;
begin
  select *
  into v_asistencia
  from public.asistencia
  where id = new.asistencia_id;

  if not found then
    raise exception 'VENTA_REQUIERE_ASISTENCIA_EXISTENTE';
  end if;

  if v_asistencia.empleado_id <> new.empleado_id then
    raise exception 'VENTA_EMPLEADO_NO_COINCIDE_CON_ASISTENCIA';
  end if;

  if v_asistencia.pdv_id <> new.pdv_id then
    raise exception 'VENTA_PDV_NO_COINCIDE_CON_ASISTENCIA';
  end if;

  if v_asistencia.cuenta_cliente_id <> new.cuenta_cliente_id then
    raise exception 'VENTA_CUENTA_CLIENTE_NO_COINCIDE_CON_ASISTENCIA';
  end if;

  if v_asistencia.estatus = 'RECHAZADA' or v_asistencia.check_in_utc is null then
    raise exception 'VENTA_REQUIERE_JORNADA_VALIDA';
  end if;

  return new;
end;
$$;

create trigger trg_venta_validar_asistencia
before insert or update on public.venta
for each row execute function public.validar_venta_con_asistencia_base();

alter table public.venta enable row level security;

create policy "venta_select_base"
on public.venta
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "venta_insert_operacion"
on public.venta
for insert
to authenticated
with check (
  public.es_administrador()
  or (public.es_usuario_interno() and empleado_id = public.get_my_empleado_id())
);

create policy "venta_update_operacion"
on public.venta
for update
to authenticated
using (
  public.es_administrador()
  or empleado_id = public.get_my_empleado_id()
  or validada_por_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or empleado_id = public.get_my_empleado_id()
  or validada_por_empleado_id = public.get_my_empleado_id()
);
