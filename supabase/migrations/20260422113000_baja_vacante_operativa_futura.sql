alter table public.asignacion
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.vacante_operativa_futura (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id),
  empleado_origen_id uuid not null references public.empleado(id),
  asignacion_origen_id uuid null references public.asignacion(id),
  asignacion_cancelada_id uuid null references public.asignacion(id),
  pdv_id uuid not null references public.pdv(id),
  tipo_vacante text not null
    check (tipo_vacante in ('VACANTE_ACTUAL_POR_BAJA', 'VACANTE_FUTURA_POR_MOVIMIENTO_CANCELADO')),
  fecha_vacante_desde date not null,
  fecha_baja_efectiva date not null,
  motivo text null,
  estado_seguimiento text not null default 'NUEVA'
    check (estado_seguimiento in ('NUEVA', 'EN_REVISION', 'EN_REASIGNACION', 'RESUELTA', 'DESCARTADA')),
  accion_recomendada text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_vacante_operativa_futura_cuenta_fecha
  on public.vacante_operativa_futura(cuenta_cliente_id, fecha_vacante_desde);

create index if not exists idx_vacante_operativa_futura_pdv_fecha
  on public.vacante_operativa_futura(pdv_id, fecha_vacante_desde);

create index if not exists idx_vacante_operativa_futura_estado_fecha
  on public.vacante_operativa_futura(estado_seguimiento, fecha_vacante_desde);

create index if not exists idx_vacante_operativa_futura_empleado_fecha
  on public.vacante_operativa_futura(empleado_origen_id, fecha_vacante_desde);

create table if not exists public.asignacion_baja_historial (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id),
  empleado_id uuid not null references public.empleado(id),
  asignacion_id uuid not null references public.asignacion(id),
  vacante_operativa_futura_id uuid null references public.vacante_operativa_futura(id) on delete set null,
  pdv_origen_id uuid null references public.pdv(id),
  pdv_destino_id uuid null references public.pdv(id),
  fecha_inicio_original date not null,
  fecha_fin_original date null,
  fecha_baja_efectiva date not null,
  accion_aplicada text not null
    check (accion_aplicada in ('VACANTE_ACTUAL_GENERADA', 'MOVIMIENTO_CANCELADO', 'VACANTE_FUTURA_GENERADA')),
  usuario_actor_id uuid null references public.usuario(id),
  motivo text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_asignacion_baja_historial_empleado_fecha
  on public.asignacion_baja_historial(empleado_id, fecha_baja_efectiva);

create index if not exists idx_asignacion_baja_historial_asignacion
  on public.asignacion_baja_historial(asignacion_id);

create index if not exists idx_asignacion_baja_historial_vacante
  on public.asignacion_baja_historial(vacante_operativa_futura_id);

alter table public.vacante_operativa_futura enable row level security;
alter table public.asignacion_baja_historial enable row level security;

drop policy if exists "vacante_operativa_futura_select_base" on public.vacante_operativa_futura;
create policy "vacante_operativa_futura_select_base"
on public.vacante_operativa_futura
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "asignacion_baja_historial_select_base" on public.asignacion_baja_historial;
create policy "asignacion_baja_historial_select_base"
on public.asignacion_baja_historial
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);
