create table if not exists public.asistencia (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  asignacion_id uuid references public.asignacion(id) on delete set null,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  supervisor_empleado_id uuid references public.empleado(id) on delete set null,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  fecha_operacion date not null default current_date,
  empleado_nombre text not null,
  pdv_clave_btl text not null,
  pdv_nombre text not null,
  pdv_zona text,
  cadena_nombre text,
  check_in_utc timestamptz,
  check_out_utc timestamptz,
  latitud_check_in numeric(10,7),
  longitud_check_in numeric(10,7),
  latitud_check_out numeric(10,7),
  longitud_check_out numeric(10,7),
  distancia_check_in_metros integer,
  distancia_check_out_metros integer,
  estado_gps text not null default 'PENDIENTE' check (
    estado_gps in ('PENDIENTE', 'DENTRO_GEOCERCA', 'FUERA_GEOCERCA', 'SIN_GPS')
  ),
  justificacion_fuera_geocerca text,
  mision_dia_id uuid references public.mision_dia(id) on delete set null,
  mision_codigo text,
  mision_instruccion text,
  biometria_estado text not null default 'NO_EVALUADA' check (
    biometria_estado in ('PENDIENTE', 'VALIDA', 'RECHAZADA', 'NO_EVALUADA')
  ),
  biometria_score numeric(5,2),
  selfie_check_in_hash text,
  selfie_check_in_url text,
  selfie_check_out_hash text,
  selfie_check_out_url text,
  estatus text not null default 'PENDIENTE_VALIDACION' check (
    estatus in ('PENDIENTE_VALIDACION', 'VALIDA', 'RECHAZADA', 'CERRADA')
  ),
  origen text not null default 'ONLINE' check (
    origen in ('ONLINE', 'OFFLINE_SYNC', 'AJUSTE_ADMIN')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    check_in_utc is null
    or check_out_utc is null
    or check_out_utc >= check_in_utc
  )
);

create index if not exists idx_asistencia_cuenta_fecha
on public.asistencia(cuenta_cliente_id, fecha_operacion desc);

create index if not exists idx_asistencia_empleado_fecha
on public.asistencia(empleado_id, fecha_operacion desc);

create index if not exists idx_asistencia_pdv_fecha
on public.asistencia(pdv_id, fecha_operacion desc);

create index if not exists idx_asistencia_estatus
on public.asistencia(estatus, fecha_operacion desc);

create trigger trg_asistencia_updated_at
before update on public.asistencia
for each row execute function public.actualizar_updated_at();

alter table public.asistencia enable row level security;

create policy "asistencia_select_base"
on public.asistencia
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "asistencia_insert_operacion"
on public.asistencia
for insert
to authenticated
with check (
  public.es_administrador()
  or (public.es_usuario_interno() and empleado_id = public.get_my_empleado_id())
);

create policy "asistencia_update_operacion"
on public.asistencia
for update
to authenticated
using (
  public.es_administrador()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
);
