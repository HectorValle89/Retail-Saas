-- Atribución temporal inmutable para registros del portal público.
-- La captura conserva la asignación y el supervisor efectivos de su fecha operativa.

alter table public.captura_publica_registro
  add column if not exists asignacion_id uuid references public.asignacion(id) on delete set null,
  add column if not exists supervisor_empleado_id uuid references public.empleado(id) on delete set null;

comment on column public.captura_publica_registro.asignacion_id is
  'Asignación efectiva resuelta para empleado + PDV + fecha_operativa al registrar la captura.';
comment on column public.captura_publica_registro.supervisor_empleado_id is
  'Snapshot del supervisor efectivo en fecha_operativa; preserva el histórico ante cambios futuros.';

create index if not exists idx_captura_publica_registro_supervisor_fecha
  on public.captura_publica_registro(cuenta_cliente_id, supervisor_empleado_id, fecha_operativa desc);

create index if not exists idx_venta_captura_publica_id
  on public.venta((metadata ->> 'captura_publica_id'))
  where metadata ? 'captura_publica_id';

create index if not exists idx_love_isdin_captura_publica_id
  on public.love_isdin((metadata ->> 'captura_publica_id'))
  where metadata ? 'captura_publica_id';

create or replace function public.resolver_atribucion_captura_publica(
  p_cuenta_cliente_id uuid,
  p_empleado_id uuid,
  p_pdv_id uuid,
  p_fecha_operativa date
)
returns table (
  asignacion_id uuid,
  supervisor_empleado_id uuid,
  origen text
)
language sql
stable
security definer
set search_path = public
as $$
  with asignacion_vigente as (
    select asignacion.id, asignacion.supervisor_empleado_id
    from public.asignacion
    where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
      and asignacion.empleado_id = p_empleado_id
      and asignacion.pdv_id = p_pdv_id
      and asignacion.estado_publicacion = 'PUBLICADA'
      and asignacion.fecha_inicio <= p_fecha_operativa
      and coalesce(asignacion.fecha_fin, date '9999-12-31') >= p_fecha_operativa
    order by asignacion.fecha_inicio desc, asignacion.created_at desc
    limit 1
  ), supervisor_pdv_vigente as (
    select relacion.empleado_id
    from public.supervisor_pdv relacion
    where relacion.pdv_id = p_pdv_id
      and relacion.activo
      and relacion.fecha_inicio <= p_fecha_operativa
      and coalesce(relacion.fecha_fin, date '9999-12-31') >= p_fecha_operativa
    order by relacion.fecha_inicio desc, relacion.created_at desc
    limit 1
  ), asistencia_vigente as (
    select asistencia.supervisor_empleado_id
    from public.asistencia
    where asistencia.cuenta_cliente_id = p_cuenta_cliente_id
      and asistencia.empleado_id = p_empleado_id
      and asistencia.pdv_id = p_pdv_id
      and asistencia.fecha_operacion = p_fecha_operativa
    order by asistencia.created_at asc
    limit 1
  ), empleado_actual as (
    select empleado.supervisor_empleado_id
    from public.empleado
    where empleado.id = p_empleado_id
  )
  select
    asignacion_vigente.id,
    coalesce(
      asignacion_vigente.supervisor_empleado_id,
      supervisor_pdv_vigente.empleado_id,
      asistencia_vigente.supervisor_empleado_id,
      empleado_actual.supervisor_empleado_id
    ),
    case
      when asignacion_vigente.supervisor_empleado_id is not null then 'ASIGNACION'
      when supervisor_pdv_vigente.empleado_id is not null then 'SUPERVISOR_PDV'
      when asistencia_vigente.supervisor_empleado_id is not null then 'ASISTENCIA_HISTORICA'
      when empleado_actual.supervisor_empleado_id is not null then 'EMPLEADO_FALLBACK'
      else 'SIN_SUPERVISOR'
    end
  from (values (1)) as base(dummy)
  left join asignacion_vigente on true
  left join supervisor_pdv_vigente on true
  left join asistencia_vigente on true
  left join empleado_actual on true;
$$;

revoke all on function public.resolver_atribucion_captura_publica(uuid, uuid, uuid, date) from public;
grant execute on function public.resolver_atribucion_captura_publica(uuid, uuid, uuid, date) to service_role;

create or replace function public.fn_captura_publica_atribucion_efectiva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atribucion record;
begin
  select * into v_atribucion
  from public.resolver_atribucion_captura_publica(
    new.cuenta_cliente_id,
    new.empleado_id,
    new.pdv_id,
    new.fecha_operativa
  );

  new.asignacion_id := v_atribucion.asignacion_id;
  new.supervisor_empleado_id := v_atribucion.supervisor_empleado_id;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'atribucion_operativa',
    jsonb_build_object(
      'version', 1,
      'origen', v_atribucion.origen,
      'asignacion_id', v_atribucion.asignacion_id,
      'supervisor_empleado_id', v_atribucion.supervisor_empleado_id,
      'fecha_operativa', new.fecha_operativa
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_captura_publica_00_atribucion_efectiva
  on public.captura_publica_registro;
create trigger trg_captura_publica_00_atribucion_efectiva
before insert or update of cuenta_cliente_id, empleado_id, pdv_id, fecha_operativa
on public.captura_publica_registro
for each row execute function public.fn_captura_publica_atribucion_efectiva();

create or replace function public.fn_captura_publica_propagar_atribucion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha_utc timestamptz;
begin
  v_fecha_utc := (new.fecha_operativa::text || ' 12:00:00 America/Mexico_City')::timestamptz;

  update public.asistencia
  set asignacion_id = coalesce(new.asignacion_id, asistencia.asignacion_id),
      supervisor_empleado_id = new.supervisor_empleado_id,
      updated_at = timezone('utc', now())
  where asistencia.cuenta_cliente_id = new.cuenta_cliente_id
    and asistencia.empleado_id = new.empleado_id
    and asistencia.pdv_id = new.pdv_id
    and asistencia.fecha_operacion = new.fecha_operativa
    and (
      asistencia.asignacion_id is distinct from coalesce(new.asignacion_id, asistencia.asignacion_id)
      or asistencia.supervisor_empleado_id is distinct from new.supervisor_empleado_id
    );

  update public.venta
  set fecha_utc = v_fecha_utc,
      metadata = coalesce(venta.metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', new.supervisor_empleado_id,
        'fecha_operativa', new.fecha_operativa
      ),
      updated_at = timezone('utc', now())
  where venta.metadata ->> 'captura_publica_id' = new.id::text
    and (
      venta.fecha_utc is distinct from v_fecha_utc
      or venta.metadata ->> 'supervisor_empleado_id' is distinct from new.supervisor_empleado_id::text
    );

  update public.love_isdin
  set fecha_utc = v_fecha_utc,
      metadata = coalesce(love_isdin.metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', new.supervisor_empleado_id,
        'fecha_operativa', new.fecha_operativa
      ),
      updated_at = timezone('utc', now())
  where love_isdin.metadata ->> 'captura_publica_id' = new.id::text
    and (
      love_isdin.fecha_utc is distinct from v_fecha_utc
      or love_isdin.metadata ->> 'supervisor_empleado_id' is distinct from new.supervisor_empleado_id::text
    );

  return new;
end;
$$;

drop trigger if exists trg_captura_publica_90_propagar_atribucion
  on public.captura_publica_registro;
drop trigger if exists trg_captura_publica_zz_propagar_atribucion
  on public.captura_publica_registro;

-- El prefijo `zz` fuerza la ejecución después del trigger de consolidación automática,
-- ya que PostgreSQL ordena alfabéticamente los triggers del mismo evento.
create trigger trg_captura_publica_zz_propagar_atribucion
after insert or update of asignacion_id, supervisor_empleado_id, fecha_operativa
on public.captura_publica_registro
for each row execute function public.fn_captura_publica_propagar_atribucion();

create or replace view public.love_isdin_resumen_diario
with (security_invoker = on) as
select
  timezone('America/Mexico_City', love.fecha_utc)::date as fecha_operacion,
  love.cuenta_cliente_id,
  love.pdv_id,
  love.empleado_id,
  coalesce(
    asistencia.supervisor_empleado_id,
    nullif(love.metadata ->> 'supervisor_empleado_id', '')::uuid,
    empleado.supervisor_empleado_id
  ) as supervisor_empleado_id,
  pdv.zona,
  cadena.nombre as cadena,
  love.qr_codigo_id,
  count(*)::integer as afiliaciones_total,
  count(*) filter (where love.estatus = 'VALIDA')::integer as afiliaciones_validas,
  count(*) filter (where love.estatus = 'PENDIENTE_VALIDACION')::integer as afiliaciones_pendientes,
  count(*) filter (where love.estatus = 'RECHAZADA')::integer as afiliaciones_rechazadas,
  count(*) filter (where love.estatus = 'DUPLICADA')::integer as afiliaciones_duplicadas
from public.love_isdin love
left join public.asistencia asistencia on asistencia.id = love.asistencia_id
left join public.empleado empleado on empleado.id = love.empleado_id
left join public.pdv pdv on pdv.id = love.pdv_id
left join public.cadena cadena on cadena.id = pdv.cadena_id
group by
  timezone('America/Mexico_City', love.fecha_utc)::date,
  love.cuenta_cliente_id,
  love.pdv_id,
  love.empleado_id,
  coalesce(
    asistencia.supervisor_empleado_id,
    nullif(love.metadata ->> 'supervisor_empleado_id', '')::uuid,
    empleado.supervisor_empleado_id
  ),
  pdv.zona,
  cadena.nombre,
  love.qr_codigo_id;

drop policy if exists "captura_publica_registro_select_base"
  on public.captura_publica_registro;
create policy "captura_publica_registro_select_base"
on public.captura_publica_registro
for select
to authenticated
using (
  (
    public.es_usuario_interno()
    and (
      public.get_my_role() <> 'SUPERVISOR'
      or supervisor_empleado_id = public.get_my_empleado_id()
    )
  )
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "captura_publica_registro_update_admin"
  on public.captura_publica_registro;
create policy "captura_publica_registro_update_admin"
on public.captura_publica_registro
for update
to authenticated
using (
  public.es_administrador()
  or public.get_my_role() in ('COORDINADOR', 'VENTAS', 'LOVE_IS')
  or (
    public.get_my_role() = 'SUPERVISOR'
    and supervisor_empleado_id = public.get_my_empleado_id()
  )
)
with check (
  public.es_administrador()
  or public.get_my_role() in ('COORDINADOR', 'VENTAS', 'LOVE_IS')
  or (
    public.get_my_role() = 'SUPERVISOR'
    and supervisor_empleado_id = public.get_my_empleado_id()
  )
);
