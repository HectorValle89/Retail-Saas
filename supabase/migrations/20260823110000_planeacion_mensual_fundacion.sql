-- Fundación de Planeación Mensual de Asignaciones.
-- Este corte crea fuentes y proyecciones; las RPC de publicación se agregan en el siguiente corte.

alter table public.asignacion
  drop constraint if exists asignacion_naturaleza_check;

update public.asignacion
set naturaleza = case
  when naturaleza = 'MOVIMIENTO' and retorna_a_base then 'COBERTURA_TEMPORAL'
  when naturaleza = 'MOVIMIENTO' then 'COBERTURA_PERMANENTE'
  else naturaleza
end
where naturaleza = 'MOVIMIENTO';

alter table public.asignacion
  add constraint asignacion_naturaleza_check
  check (naturaleza in ('BASE', 'COBERTURA_TEMPORAL', 'COBERTURA_PERMANENTE'))
  not valid;

alter table public.asignacion validate constraint asignacion_naturaleza_check;

create table if not exists public.planeacion_cambio_lote (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  mes date not null check (
    mes = make_date(extract(year from mes)::integer, extract(month from mes)::integer, 1)
  ),
  estado text not null default 'BORRADOR'
    check (estado in ('BORRADOR', 'VALIDADO', 'PUBLICADO', 'CANCELADO')),
  version_base bigint not null default 0 check (version_base >= 0),
  idempotency_key text not null,
  resumen_impacto jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  publicado_por_usuario_id uuid references public.usuario(id) on delete set null,
  publicado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, idempotency_key)
);

create table if not exists public.planeacion_cambio_operacion (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.planeacion_cambio_lote(id) on delete cascade,
  orden integer not null check (orden > 0),
  tipo_operacion text not null check (
    tipo_operacion in (
      'ASIGNAR_DC',
      'LIBERAR_DC',
      'MOVER_DC',
      'INTERCAMBIAR_DCS',
      'COBERTURA_TEMPORAL',
      'COBERTURA_PERMANENTE',
      'CAMBIAR_ROTACION',
      'CAMBIAR_HORARIO',
      'CAMBIAR_DESCANSO',
      'CAMBIAR_ESTADO_PDV',
      'REASIGNAR_SUPERVISOR'
    )
  ),
  empleado_id uuid references public.empleado(id) on delete restrict,
  empleado_destino_id uuid references public.empleado(id) on delete restrict,
  pdv_origen_id uuid references public.pdv(id) on delete restrict,
  pdv_destino_id uuid references public.pdv(id) on delete restrict,
  fecha_inicio date not null,
  fecha_fin date,
  es_temporal boolean not null default false,
  motivo text not null check (length(trim(motivo)) > 0),
  payload jsonb not null default '{}'::jsonb,
  resultado_validacion jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (lote_id, orden),
  check (fecha_fin is null or fecha_fin >= fecha_inicio),
  check (not es_temporal or fecha_fin is not null)
);

create table if not exists public.catalogo_turno (
  codigo text primary key,
  nombre text not null,
  hora_entrada time,
  hora_salida time,
  duracion_minutos integer check (duracion_minutos is null or duracion_minutos > 0),
  tipo text not null check (tipo in ('ESTANDAR', 'ESPECIAL', 'FORMACION', 'VACANTE')),
  color_token text not null,
  genera_asistencia boolean not null default true,
  genera_cuota_pdv boolean not null default true,
  permite_horas_personalizadas boolean not null default false,
  activo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    permite_horas_personalizadas
    or (hora_entrada is not null and hora_salida is not null)
    or tipo in ('FORMACION', 'VACANTE')
  )
);

create table if not exists public.pdv_estado_vigencia (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  estado text not null check (estado in ('ACTIVO', 'PAUSADO', 'INACTIVO')),
  vigente_desde date not null,
  vigente_hasta date,
  motivo text not null,
  metadata jsonb not null default '{}'::jsonb,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create table if not exists public.pdv_rotacion_vigencia (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  naturaleza text not null check (naturaleza in ('FIJA', 'ROTATIVA')),
  factor_tiempo numeric(6,3) not null check (factor_tiempo > 0 and factor_tiempo <= 1),
  grupo_rotacion text,
  vigente_desde date not null,
  vigente_hasta date,
  motivo text not null,
  metadata jsonb not null default '{}'::jsonb,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  check (naturaleza <> 'ROTATIVA' or grupo_rotacion is not null)
);

create table if not exists public.cuota_carga_lote (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  mes date not null check (
    mes = make_date(extract(year from mes)::integer, extract(month from mes)::integer, 1)
  ),
  nombre_archivo text not null,
  hash_archivo text not null,
  estado text not null default 'BORRADOR'
    check (estado in ('BORRADOR', 'VALIDADO', 'PUBLICADO', 'RECHAZADO')),
  total_filas integer not null default 0 check (total_filas >= 0),
  total_errores integer not null default 0 check (total_errores >= 0),
  resumen_validacion jsonb not null default '{}'::jsonb,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  publicado_por_usuario_id uuid references public.usuario(id) on delete set null,
  publicado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, hash_archivo)
);

create table if not exists public.cuotas_diarias_pdv (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  fecha date not null,
  monto_cuota numeric(14,2) not null check (monto_cuota >= 0),
  cuota_mensual_referencia numeric(14,2) check (
    cuota_mensual_referencia is null or cuota_mensual_referencia >= 0
  ),
  peso_dia numeric(10,4) not null default 1 check (peso_dia >= 0),
  lote_importacion_id uuid references public.cuota_carga_lote(id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  estado text not null default 'BORRADOR'
    check (estado in ('BORRADOR', 'PUBLICADA', 'REEMPLAZADA', 'CERRADA')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, pdv_id, fecha, version)
);

create unique index if not exists uq_cuotas_diarias_pdv_publicada
on public.cuotas_diarias_pdv(cuenta_cliente_id, pdv_id, fecha)
where estado = 'PUBLICADA';

create table if not exists public.cuota_asignacion_diaria_dc (
  id uuid primary key default gen_random_uuid(),
  cuota_diaria_pdv_id uuid not null references public.cuotas_diarias_pdv(id) on delete restrict,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  fecha date not null,
  cuota_diaria_pdv numeric(14,2) not null check (cuota_diaria_pdv >= 0),
  factor_participacion numeric(10,6) not null check (
    factor_participacion >= 0 and factor_participacion <= 1
  ),
  monto_asignado numeric(14,2) not null check (monto_asignado >= 0),
  estado_calculo text not null check (estado_calculo in ('PROYECTADA', 'VIGENTE', 'CIERRE')),
  motivo_ajuste text,
  referencia_asignacion_id uuid,
  referencia_asistencia_id uuid references public.asistencia(id) on delete set null,
  version bigint not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, empleado_id, pdv_id, fecha, estado_calculo, version)
);

create table if not exists public.planeacion_mensual_snapshot_fila (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  mes date not null check (
    mes = make_date(extract(year from mes)::integer, extract(month from mes)::integer, 1)
  ),
  pdv_id uuid not null references public.pdv(id) on delete cascade,
  segmento_clave text not null,
  version_snapshot bigint not null check (version_snapshot > 0),
  es_vigente boolean not null default true,
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, mes, pdv_id, segmento_clave, version_snapshot)
);

create unique index if not exists uq_planeacion_snapshot_fila_vigente
on public.planeacion_mensual_snapshot_fila(cuenta_cliente_id, mes, pdv_id, segmento_clave)
where es_vigente;

create table if not exists public.planeacion_evento_outbox (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  lote_id uuid references public.planeacion_cambio_lote(id) on delete set null,
  evento text not null,
  mes date,
  payload jsonb not null default '{}'::jsonb,
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'PROCESANDO', 'PROCESADO', 'ERROR')),
  intentos integer not null default 0 check (intentos >= 0),
  disponible_desde timestamptz not null default now(),
  procesado_at timestamptz,
  ultimo_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_planeacion_lote_cuenta_mes_estado
on public.planeacion_cambio_lote(cuenta_cliente_id, mes, estado, updated_at desc);

create index if not exists idx_planeacion_operacion_lote_orden
on public.planeacion_cambio_operacion(lote_id, orden);

create index if not exists idx_pdv_estado_vigencia_fecha
on public.pdv_estado_vigencia(cuenta_cliente_id, pdv_id, vigente_desde, vigente_hasta);

create index if not exists idx_pdv_rotacion_vigencia_fecha
on public.pdv_rotacion_vigencia(cuenta_cliente_id, pdv_id, vigente_desde, vigente_hasta);

create index if not exists idx_cuotas_diarias_pdv_mes
on public.cuotas_diarias_pdv(cuenta_cliente_id, fecha, pdv_id)
where estado in ('PUBLICADA', 'CERRADA');

create index if not exists idx_cuota_dc_empleado_fecha
on public.cuota_asignacion_diaria_dc(cuenta_cliente_id, empleado_id, fecha, estado_calculo);

create index if not exists idx_cuota_dc_pdv_fecha
on public.cuota_asignacion_diaria_dc(cuenta_cliente_id, pdv_id, fecha, estado_calculo);

create index if not exists idx_planeacion_snapshot_cuenta_mes
on public.planeacion_mensual_snapshot_fila(cuenta_cliente_id, mes, es_vigente, pdv_id);

create index if not exists idx_planeacion_outbox_pendiente
on public.planeacion_evento_outbox(estado, disponible_desde, created_at)
where estado in ('PENDIENTE', 'ERROR');

insert into public.catalogo_turno (
  codigo, nombre, hora_entrada, hora_salida, duracion_minutos, tipo, color_token,
  genera_asistencia, genera_cuota_pdv, permite_horas_personalizadas
)
values
  ('M', 'Matutino', '09:00', '15:00', 360, 'ESTANDAR', 'turno-m', true, true, false),
  ('TCM', 'Turno completo matutino', '09:00', '17:00', 480, 'ESTANDAR', 'turno-tcm', true, true, false),
  ('TC', 'Turno completo medio', '11:00', '19:00', 480, 'ESTANDAR', 'turno-tc', true, true, false),
  ('TC_12', 'Turno completo medio 12', '12:00', '20:00', 480, 'ESTANDAR', 'turno-tc12', true, true, false),
  ('TCV', 'Turno completo vespertino', '13:00', '21:00', 480, 'ESTANDAR', 'turno-tcv', true, true, false),
  ('V1', 'Vespertino 1', '14:00', '20:00', 360, 'ESTANDAR', 'turno-v1', true, true, false),
  ('V', 'Vespertino', '15:00', '21:00', 360, 'ESTANDAR', 'turno-v', true, true, false),
  ('ES1', 'Especial / Activación', null, null, null, 'ESPECIAL', 'turno-es1', true, true, true),
  ('ACT', 'Activación', null, null, null, 'ESPECIAL', 'turno-act', true, true, true),
  ('CAP', 'Capacitación', null, null, null, 'FORMACION', 'turno-cap', true, false, true),
  ('VC', 'Vacante', null, null, null, 'VACANTE', 'turno-vc', false, false, false)
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  hora_entrada = excluded.hora_entrada,
  hora_salida = excluded.hora_salida,
  duracion_minutos = excluded.duracion_minutos,
  tipo = excluded.tipo,
  color_token = excluded.color_token,
  genera_asistencia = excluded.genera_asistencia,
  genera_cuota_pdv = excluded.genera_cuota_pdv,
  permite_horas_personalizadas = excluded.permite_horas_personalizadas,
  activo = true,
  updated_at = now();

drop trigger if exists trg_planeacion_cambio_lote_updated_at on public.planeacion_cambio_lote;
create trigger trg_planeacion_cambio_lote_updated_at
before update on public.planeacion_cambio_lote
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_catalogo_turno_updated_at on public.catalogo_turno;
create trigger trg_catalogo_turno_updated_at
before update on public.catalogo_turno
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_pdv_estado_vigencia_updated_at on public.pdv_estado_vigencia;
create trigger trg_pdv_estado_vigencia_updated_at
before update on public.pdv_estado_vigencia
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_pdv_rotacion_vigencia_updated_at on public.pdv_rotacion_vigencia;
create trigger trg_pdv_rotacion_vigencia_updated_at
before update on public.pdv_rotacion_vigencia
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_cuota_carga_lote_updated_at on public.cuota_carga_lote;
create trigger trg_cuota_carga_lote_updated_at
before update on public.cuota_carga_lote
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_cuotas_diarias_pdv_updated_at on public.cuotas_diarias_pdv;
create trigger trg_cuotas_diarias_pdv_updated_at
before update on public.cuotas_diarias_pdv
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_cuota_asignacion_diaria_dc_updated_at on public.cuota_asignacion_diaria_dc;
create trigger trg_cuota_asignacion_diaria_dc_updated_at
before update on public.cuota_asignacion_diaria_dc
for each row execute function public.actualizar_updated_at();

alter table public.planeacion_cambio_lote enable row level security;
alter table public.planeacion_cambio_operacion enable row level security;
alter table public.catalogo_turno enable row level security;
alter table public.pdv_estado_vigencia enable row level security;
alter table public.pdv_rotacion_vigencia enable row level security;
alter table public.cuota_carga_lote enable row level security;
alter table public.cuotas_diarias_pdv enable row level security;
alter table public.cuota_asignacion_diaria_dc enable row level security;
alter table public.planeacion_mensual_snapshot_fila enable row level security;
alter table public.planeacion_evento_outbox enable row level security;

create policy "catalogo_turno_select_interno"
on public.catalogo_turno for select to authenticated
using (public.es_usuario_interno());

create policy "planeacion_lote_select_ambito"
on public.planeacion_cambio_lote for select to authenticated
using (
  public.es_administrador()
  or (public.es_usuario_interno() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "planeacion_operacion_select_ambito"
on public.planeacion_cambio_operacion for select to authenticated
using (
  exists (
    select 1 from public.planeacion_cambio_lote lote
    where lote.id = lote_id
      and (
        public.es_administrador()
        or (public.es_usuario_interno() and lote.cuenta_cliente_id = public.get_my_cuenta_cliente_id())
      )
  )
);

create policy "pdv_estado_vigencia_select_ambito"
on public.pdv_estado_vigencia for select to authenticated
using (
  public.es_administrador()
  or (public.es_usuario_interno() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "pdv_rotacion_vigencia_select_ambito"
on public.pdv_rotacion_vigencia for select to authenticated
using (
  public.es_administrador()
  or (public.es_usuario_interno() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "cuota_carga_lote_select_ambito"
on public.cuota_carga_lote for select to authenticated
using (
  public.es_administrador()
  or (public.es_usuario_interno() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "cuotas_diarias_pdv_select_ambito"
on public.cuotas_diarias_pdv for select to authenticated
using (
  public.es_administrador()
  or (public.es_usuario_interno() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "cuota_asignacion_dc_select_ambito"
on public.cuota_asignacion_diaria_dc for select to authenticated
using (
  public.es_administrador()
  or empleado_id = public.get_my_empleado_id()
  or (public.es_usuario_interno() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "planeacion_snapshot_select_ambito"
on public.planeacion_mensual_snapshot_fila for select to authenticated
using (
  public.es_administrador()
  or (public.es_usuario_interno() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

revoke insert, update, delete on table
  public.planeacion_cambio_lote,
  public.planeacion_cambio_operacion,
  public.catalogo_turno,
  public.pdv_estado_vigencia,
  public.pdv_rotacion_vigencia,
  public.cuota_carga_lote,
  public.cuotas_diarias_pdv,
  public.cuota_asignacion_diaria_dc,
  public.planeacion_mensual_snapshot_fila,
  public.planeacion_evento_outbox
from authenticated;

grant select on table
  public.planeacion_cambio_lote,
  public.planeacion_cambio_operacion,
  public.catalogo_turno,
  public.pdv_estado_vigencia,
  public.pdv_rotacion_vigencia,
  public.cuota_carga_lote,
  public.cuotas_diarias_pdv,
  public.cuota_asignacion_diaria_dc,
  public.planeacion_mensual_snapshot_fila
to authenticated;

grant select, insert, update, delete on table
  public.planeacion_cambio_lote,
  public.planeacion_cambio_operacion,
  public.catalogo_turno,
  public.pdv_estado_vigencia,
  public.pdv_rotacion_vigencia,
  public.cuota_carga_lote,
  public.cuotas_diarias_pdv,
  public.cuota_asignacion_diaria_dc,
  public.planeacion_mensual_snapshot_fila,
  public.planeacion_evento_outbox
to service_role;

comment on table public.cuotas_diarias_pdv is
  'Fuente diaria de cuotas por PDV; la suma mensual debe coincidir con la cuota aprobada del PDV.';

comment on table public.planeacion_mensual_snapshot_fila is
  'Read model mensual incremental consumido por una única consulta cacheada por cuenta y mes.';
