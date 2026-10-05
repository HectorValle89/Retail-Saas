-- Migración: 20261004140000_corregir_max_uuid_y_baja_supervisor.sql
-- Propósito:
-- 1. Definir agregados nativos max(uuid) y min(uuid) en PostgreSQL para evitar errores "function max(uuid) does not exist".
-- 2. Corregir fn_limpiar_impacto_baja_empleado para no depender de max(uuid) y resolver cuenta_cliente_id de forma robusta.

-- 1. Definición de agregados nativos para UUID
create or replace function public.uuid_larger(uuid, uuid)
returns uuid
language sql
immutable
parallel safe
as $$
  select case
    when $1 is null then $2
    when $2 is null then $1
    when $1 >= $2 then $1
    else $2
  end;
$$;

create or replace function public.uuid_smaller(uuid, uuid)
returns uuid
language sql
immutable
parallel safe
as $$
  select case
    when $1 is null then $2
    when $2 is null then $1
    when $1 <= $2 then $1
    else $2
  end;
$$;

create or replace aggregate public.max(uuid) (
  sfunc = public.uuid_larger,
  stype = uuid,
  combinefunc = public.uuid_larger,
  parallel = safe,
  sortop = >
);

create or replace aggregate public.min(uuid) (
  sfunc = public.uuid_smaller,
  stype = uuid,
  combinefunc = public.uuid_smaller,
  parallel = safe,
  sortop = <
);

-- 2. Corrección del trigger de baja de empleado para evitar errores con UUID
create or replace function public.fn_limpiar_impacto_baja_empleado()
returns trigger
language plpgsql
security definer
as $$
declare
  v_fecha_baja date;
  v_cuenta_id uuid;
  v_pdv_ids uuid[];
  v_mes date;
begin
  if new.estatus_laboral = 'BAJA' and new.fecha_baja is not null then
    v_fecha_baja := new.fecha_baja;
    v_mes := date_trunc('month', v_fecha_baja)::date;

    -- a) Recopilar PDVs y cuenta donde el colaborador tenía asignaciones en el mes de la baja
    select array_agg(distinct pdv_id), (array_agg(distinct cuenta_cliente_id))[1]
    into v_pdv_ids, v_cuenta_id
    from public.asignacion
    where empleado_id = new.id
      and (fecha_inicio <= (date_trunc('month', v_fecha_baja) + interval '1 month - 1 day')::date)
      and (fecha_fin is null or fecha_fin >= v_mes);

    -- Si no se obtuvo cuenta de la asignación pero hay PDVs, buscar la cuenta del PDV
    if v_cuenta_id is null and v_pdv_ids is not null and cardinality(v_pdv_ids) > 0 then
      select cuenta_cliente_id into v_cuenta_id
      from public.cuenta_cliente_pdv
      where pdv_id = any(v_pdv_ids)
      limit 1;
    end if;

    -- b) Cancelar asignaciones futuras cuya fecha de inicio sea posterior a la fecha de baja
    -- o asignaciones inconsistentes donde la fecha de inicio quedó después de la fecha de fin
    update public.asignacion
    set
      estado_publicacion = 'BORRADOR',
      observaciones = case
        when observaciones is null or observaciones = '' then 'CANCELADA_POR_BAJA ' || v_fecha_baja::text
        when observaciones like '%CANCELADA_POR_BAJA%' then observaciones
        else observaciones || E'\nCANCELADA_POR_BAJA ' || v_fecha_baja::text
      end,
      updated_at = now()
    where empleado_id = new.id
      and (fecha_inicio > v_fecha_baja or (fecha_fin is not null and fecha_inicio > fecha_fin));

    -- c) Recortar fecha_fin de asignaciones vigentes que iniciaron en o antes de la fecha_baja
    update public.asignacion
    set
      fecha_fin = v_fecha_baja,
      updated_at = now()
    where empleado_id = new.id
      and fecha_inicio <= v_fecha_baja
      and (fecha_fin is null or fecha_fin > v_fecha_baja);

    -- d) Eliminar del calendario operativo diario resuelto todas las fechas posteriores a la fecha_baja
    delete from public.asignacion_diaria_resuelta
    where empleado_id = new.id
      and fecha > v_fecha_baja;

    -- e) Purgar registros huérfanos en asignacion_diaria_resuelta para este empleado
    delete from public.asignacion_diaria_resuelta adr
    using public.asignacion a
    where adr.empleado_id = new.id
      and adr.referencia_tabla = 'asignacion'
      and a.id = adr.referencia_id
      and (adr.fecha < a.fecha_inicio or (a.fecha_fin is not null and adr.fecha > a.fecha_fin));

    -- f) Eliminar cuotas diarias posteriores a la fecha de baja si existieran
    delete from public.cuota_asignacion_diaria_dc
    where empleado_id = new.id
      and fecha > v_fecha_baja;

    -- g) Eliminar resumen de cuotas mensuales de meses posteriores al mes de baja
    delete from public.cuota_mensual_resumen_dc
    where empleado_id = new.id
      and mes > v_mes;

    -- h) Refrescar de inmediato el snapshot de planeación mensual para los PDVs afectados
    if v_cuenta_id is not null and v_pdv_ids is not null and cardinality(v_pdv_ids) > 0 then
      perform public.refrescar_planeacion_mensual_snapshot(
        v_cuenta_id,
        v_mes,
        v_pdv_ids
      );
    end if;

  end if;

  return new;
end;
$$;
