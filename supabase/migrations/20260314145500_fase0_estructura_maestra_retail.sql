-- =====================================================
-- Fase 0 - Estructura maestra retail
-- Fuente de verdad:
--   1. .kiro/specs/field-force-platform/design.md
--   2. .kiro/specs/field-force-platform/requirements.md
--   3. .kiro/specs/field-force-platform/tasks.md
--
-- Decisiones de negocio confirmadas con el usuario:
-- - Radio de geocerca por defecto: 100 metros.
-- - Check-in fuera de geocerca: permitido con justificacion.
--
-- Excepcion documentada:
-- `created_at` y `updated_at` se conservan por compatibilidad tecnica
-- con Supabase, utilidades de auditoria y patrones existentes del proyecto.
-- =====================================================

create extension if not exists pgcrypto;

create or replace function public.actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.jwt_claim_text(clave text)
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> clave, '');
$$;

create or replace function public.jwt_rol()
returns text
language sql
stable
as $$
  select coalesce(public.jwt_claim_text('rol'), '');
$$;

create or replace function public.jwt_cuenta_cliente_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'cuenta_cliente_id', '')::uuid;
$$;

create or replace function public.calcular_hash_sha256(payload jsonb)
returns text
language sql
immutable
as $$
  select encode(digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex');
$$;

create table if not exists public.cuenta_cliente (
  id uuid primary key default gen_random_uuid(),
  identificador text not null unique,
  nombre text not null,
  activa boolean not null default true,
  configuracion jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cadena (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null unique,
  factor_cuota_default numeric(6,2) not null default 1.00 check (factor_cuota_default > 0),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ciudad (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  zona text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.empleado (
  id uuid primary key default gen_random_uuid(),
  id_nomina text unique,
  nombre_completo text not null,
  curp text,
  nss text,
  rfc text,
  puesto text not null check (
    puesto in (
      'DERMOCONSEJERO',
      'SUPERVISOR',
      'COORDINADOR',
      'RECLUTAMIENTO',
      'NOMINA',
      'LOGISTICA',
      'LOVE_IS',
      'VENTAS',
      'ADMINISTRADOR',
      'CLIENTE'
    )
  ),
  zona text,
  telefono text,
  correo_electronico text,
  estatus_laboral text not null default 'ACTIVO' check (
    estatus_laboral in ('ACTIVO', 'SUSPENDIDO', 'BAJA')
  ),
  fecha_alta date,
  fecha_baja date,
  supervisor_empleado_id uuid references public.empleado(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usuario (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  cuenta_cliente_id uuid references public.cuenta_cliente(id) on delete restrict,
  username text unique,
  estado_cuenta text not null default 'PROVISIONAL' check (
    estado_cuenta in (
      'PROVISIONAL',
      'PENDIENTE_VERIFICACION_EMAIL',
      'ACTIVA',
      'SUSPENDIDA',
      'BAJA'
    )
  ),
  correo_electronico text,
  correo_verificado boolean not null default false,
  password_temporal_generada_en timestamptz,
  password_temporal_expira_en timestamptz,
  ultimo_acceso_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pdv (
  id uuid primary key default gen_random_uuid(),
  clave_btl text not null unique,
  cadena_id uuid references public.cadena(id) on delete restrict,
  ciudad_id uuid references public.ciudad(id) on delete restrict,
  id_cadena text,
  nombre text not null,
  direccion text,
  zona text,
  formato text,
  horario_entrada time,
  horario_salida time,
  estatus text not null default 'ACTIVO' check (estatus in ('ACTIVO', 'INACTIVO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.geocerca_pdv (
  id uuid primary key default gen_random_uuid(),
  pdv_id uuid not null unique references public.pdv(id) on delete cascade,
  latitud numeric(10,7) not null,
  longitud numeric(10,7) not null,
  radio_tolerancia_metros integer not null default 100 check (radio_tolerancia_metros between 1 and 1000),
  permite_checkin_con_justificacion boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.horario_pdv (
  id uuid primary key default gen_random_uuid(),
  pdv_id uuid not null references public.pdv(id) on delete cascade,
  nivel_prioridad smallint not null check (nivel_prioridad between 1 and 4),
  fecha_especifica date,
  dia_semana smallint check (dia_semana between 0 and 6),
  codigo_turno text,
  hora_entrada time,
  hora_salida time,
  activo boolean not null default true,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supervisor_pdv (
  id uuid primary key default gen_random_uuid(),
  pdv_id uuid not null references public.pdv(id) on delete cascade,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  activo boolean not null default true,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pdv_id, empleado_id, fecha_inicio)
);

create table if not exists public.cuenta_cliente_pdv (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  activo boolean not null default true,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, pdv_id, fecha_inicio)
);

create table if not exists public.configuracion (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  valor jsonb not null,
  descripcion text,
  modulo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.regla_negocio (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  modulo text not null,
  descripcion text not null,
  severidad text not null check (severidad in ('ERROR', 'ALERTA', 'AVISO')),
  prioridad integer not null default 100,
  condicion jsonb not null default '{}'::jsonb,
  accion jsonb not null default '{}'::jsonb,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mision_dia (
  id uuid primary key default gen_random_uuid(),
  instruccion text not null,
  activa boolean not null default true,
  orden integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.archivo_hash (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique,
  bucket text not null,
  ruta_archivo text not null,
  mime_type text,
  tamano_bytes bigint,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text,
  accion text not null check (accion in ('INSERT', 'UPDATE', 'DELETE', 'EVENTO')),
  payload jsonb not null default '{}'::jsonb,
  hash_sha256 text not null,
  usuario_id uuid references public.usuario(id) on delete set null,
  cuenta_cliente_id uuid references public.cuenta_cliente(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_empleado_puesto on public.empleado(puesto);
create index if not exists idx_empleado_supervisor on public.empleado(supervisor_empleado_id);
create index if not exists idx_usuario_empleado on public.usuario(empleado_id);
create index if not exists idx_usuario_cuenta_cliente on public.usuario(cuenta_cliente_id);
create index if not exists idx_pdv_cadena on public.pdv(cadena_id);
create index if not exists idx_pdv_ciudad on public.pdv(ciudad_id);
create index if not exists idx_supervisor_pdv_pdv on public.supervisor_pdv(pdv_id);
create index if not exists idx_supervisor_pdv_empleado on public.supervisor_pdv(empleado_id);
create index if not exists idx_cuenta_cliente_pdv_cuenta on public.cuenta_cliente_pdv(cuenta_cliente_id);
create index if not exists idx_cuenta_cliente_pdv_pdv on public.cuenta_cliente_pdv(pdv_id);
create index if not exists idx_regla_negocio_modulo on public.regla_negocio(modulo, activa);
create index if not exists idx_audit_log_tabla_fecha on public.audit_log(tabla, created_at desc);
create index if not exists idx_audit_log_cuenta_cliente on public.audit_log(cuenta_cliente_id, created_at desc);

create trigger trg_cuenta_cliente_updated_at
before update on public.cuenta_cliente
for each row execute function public.actualizar_updated_at();

create trigger trg_cadena_updated_at
before update on public.cadena
for each row execute function public.actualizar_updated_at();

create trigger trg_ciudad_updated_at
before update on public.ciudad
for each row execute function public.actualizar_updated_at();

create trigger trg_empleado_updated_at
before update on public.empleado
for each row execute function public.actualizar_updated_at();

create trigger trg_usuario_updated_at
before update on public.usuario
for each row execute function public.actualizar_updated_at();

create trigger trg_pdv_updated_at
before update on public.pdv
for each row execute function public.actualizar_updated_at();

create trigger trg_geocerca_pdv_updated_at
before update on public.geocerca_pdv
for each row execute function public.actualizar_updated_at();

create trigger trg_horario_pdv_updated_at
before update on public.horario_pdv
for each row execute function public.actualizar_updated_at();

create trigger trg_supervisor_pdv_updated_at
before update on public.supervisor_pdv
for each row execute function public.actualizar_updated_at();

create trigger trg_cuenta_cliente_pdv_updated_at
before update on public.cuenta_cliente_pdv
for each row execute function public.actualizar_updated_at();

create trigger trg_configuracion_updated_at
before update on public.configuracion
for each row execute function public.actualizar_updated_at();

create trigger trg_regla_negocio_updated_at
before update on public.regla_negocio
for each row execute function public.actualizar_updated_at();

create trigger trg_mision_dia_updated_at
before update on public.mision_dia
for each row execute function public.actualizar_updated_at();

create or replace function public.audit_log_proteger_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log es append-only: no se permite %', tg_op;
end;
$$;

create or replace function public.audit_log_calcular_hash()
returns trigger
language plpgsql
as $$
begin
  if new.hash_sha256 is null or new.hash_sha256 = '' then
    new.hash_sha256 = public.calcular_hash_sha256(new.payload);
  end if;
  return new;
end;
$$;

create trigger trg_audit_log_hash
before insert on public.audit_log
for each row execute function public.audit_log_calcular_hash();

create trigger trg_audit_log_append_only
before update or delete on public.audit_log
for each row execute function public.audit_log_proteger_append_only();

create or replace function public.get_my_empleado_id()
returns uuid
language sql
stable
as $$
  select u.empleado_id
  from public.usuario u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.get_my_cuenta_cliente_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    public.jwt_cuenta_cliente_id(),
    (
      select u.cuenta_cliente_id
      from public.usuario u
      where u.auth_user_id = auth.uid()
      limit 1
    )
  );
$$;

create or replace function public.get_my_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(public.jwt_claim_text('rol'), ''),
    (
      select e.puesto
      from public.usuario u
      join public.empleado e on e.id = u.empleado_id
      where u.auth_user_id = auth.uid()
      limit 1
    ),
    ''
  );
$$;

create or replace function public.es_administrador()
returns boolean
language sql
stable
as $$
  select public.get_my_role() = 'ADMINISTRADOR';
$$;

create or replace function public.es_cliente()
returns boolean
language sql
stable
as $$
  select public.get_my_role() = 'CLIENTE';
$$;

create or replace function public.es_usuario_interno()
returns boolean
language sql
stable
as $$
  select public.get_my_role() <> '' and public.get_my_role() <> 'CLIENTE';
$$;

alter table public.cuenta_cliente enable row level security;
alter table public.cadena enable row level security;
alter table public.ciudad enable row level security;
alter table public.empleado enable row level security;
alter table public.usuario enable row level security;
alter table public.pdv enable row level security;
alter table public.geocerca_pdv enable row level security;
alter table public.horario_pdv enable row level security;
alter table public.supervisor_pdv enable row level security;
alter table public.cuenta_cliente_pdv enable row level security;
alter table public.configuracion enable row level security;
alter table public.regla_negocio enable row level security;
alter table public.mision_dia enable row level security;
alter table public.archivo_hash enable row level security;
alter table public.audit_log enable row level security;

create policy "cuenta_cliente_select_base"
on public.cuenta_cliente
for select
to authenticated
using (
  public.es_administrador()
  or (public.es_cliente() and id = public.jwt_cuenta_cliente_id())
);

create policy "catalogos_select_interno"
on public.cadena
for select
to authenticated
using (public.es_usuario_interno());

create policy "ciudad_select_interno"
on public.ciudad
for select
to authenticated
using (public.es_usuario_interno());

create policy "empleado_select_interno"
on public.empleado
for select
to authenticated
using (public.es_usuario_interno());

create policy "empleado_select_propietario"
on public.empleado
for select
to authenticated
using (id = public.get_my_empleado_id());

create policy "usuario_select_admin"
on public.usuario
for select
to authenticated
using (public.es_administrador());

create policy "usuario_select_propietario"
on public.usuario
for select
to authenticated
using (auth.uid() = auth_user_id);

create policy "pdv_select_base"
on public.pdv
for select
to authenticated
using (
  public.es_usuario_interno()
  or (
    public.es_cliente()
    and exists (
      select 1
      from public.cuenta_cliente_pdv ccp
      where ccp.pdv_id = pdv.id
        and ccp.activo = true
        and ccp.cuenta_cliente_id = public.get_my_cuenta_cliente_id()
    )
  )
);

create policy "geocerca_pdv_select_interno"
on public.geocerca_pdv
for select
to authenticated
using (public.es_usuario_interno());

create policy "horario_pdv_select_base"
on public.horario_pdv
for select
to authenticated
using (public.es_usuario_interno());

create policy "supervisor_pdv_select_interno"
on public.supervisor_pdv
for select
to authenticated
using (public.es_usuario_interno());

create policy "cuenta_cliente_pdv_select_base"
on public.cuenta_cliente_pdv
for select
to authenticated
using (
  public.es_administrador()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "configuracion_select_interno"
on public.configuracion
for select
to authenticated
using (public.es_usuario_interno());

create policy "regla_negocio_select_interno"
on public.regla_negocio
for select
to authenticated
using (public.es_usuario_interno());

create policy "mision_dia_select_interno"
on public.mision_dia
for select
to authenticated
using (public.es_usuario_interno());

create policy "archivo_hash_select_interno"
on public.archivo_hash
for select
to authenticated
using (public.es_usuario_interno());

create policy "archivo_hash_insert_interno"
on public.archivo_hash
for insert
to authenticated
with check (public.es_usuario_interno());

create policy "audit_log_select_admin"
on public.audit_log
for select
to authenticated
using (public.es_administrador());

create policy "audit_log_insert_interno"
on public.audit_log
for insert
to authenticated
with check (public.es_usuario_interno() or public.es_administrador());

insert into public.configuracion (clave, valor, descripcion, modulo)
values
  (
    'geocerca.radio_default_metros',
    '100'::jsonb,
    'Radio de geocerca por defecto confirmado por negocio para v1.',
    'asistencias'
  ),
  (
    'geocerca.fuera_permitida_con_justificacion',
    'true'::jsonb,
    'Check-in fuera de geocerca permitido con justificacion segun decision validada.',
    'asistencias'
  ),
  (
    'auth.activacion.password_temporal_horas',
    '72'::jsonb,
    'Horas de vigencia para password temporal en estado PROVISIONAL.',
    'auth'
  ),
  (
    'auth.activacion.verificacion_email_horas',
    '24'::jsonb,
    'Horas de vigencia para el enlace de verificacion de correo.',
    'auth'
  )
on conflict (clave) do update
set
  valor = excluded.valor,
  descripcion = excluded.descripcion,
  modulo = excluded.modulo,
  updated_at = now();

insert into public.regla_negocio (codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa)
values
  (
    'ASISTENCIA_GEO_001',
    'asistencias',
    'Check-in fuera de geocerca permitido con justificacion cuando exista desviacion frente al radio configurado.',
    'ALERTA',
    10,
    jsonb_build_object(
      'radio_default_metros', 100,
      'evalua_desviacion', true
    ),
    jsonb_build_object(
      'permitir', true,
      'requiere_justificacion', true
    ),
    true
  )
on conflict (codigo) do update
set
  descripcion = excluded.descripcion,
  severidad = excluded.severidad,
  prioridad = excluded.prioridad,
  condicion = excluded.condicion,
  accion = excluded.accion,
  activa = excluded.activa,
  updated_at = now();
