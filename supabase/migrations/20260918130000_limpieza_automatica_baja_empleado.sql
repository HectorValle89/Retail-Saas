-- Migración: Limpieza automática de asignaciones y calendario operativo al procesar baja de empleado
-- Proyecto: HectorValle89/Retail-Saas
-- Regla de Oro: Tablas y comentarios en español latino, UTF-8 estricto sin BOM

-- 1. Función para limpiar asignaciones y calendario resuelto al dar de baja un empleado
create or replace function public.fn_limpiar_impacto_baja_empleado()
returns trigger
language plpgsql
security definer
as $$
declare
  v_fecha_baja date;
begin
  -- Solo actuar si el estatus laboral cambió a BAJA o si ya siendo BAJA se actualiza la fecha_baja
  if new.estatus_laboral = 'BAJA' and new.fecha_baja is not null then
    v_fecha_baja := new.fecha_baja;

    -- a) Cancelar asignaciones futuras cuya fecha de inicio sea posterior a la fecha de baja
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

    -- b) Recortar fecha_fin de asignaciones vigentes que iniciaron en o antes de la fecha_baja
    update public.asignacion
    set
      fecha_fin = v_fecha_baja,
      updated_at = now()
    where empleado_id = new.id
      and fecha_inicio <= v_fecha_baja
      and (fecha_fin is null or fecha_fin > v_fecha_baja);

    -- c) Eliminar del calendario operativo diario resuelto todas las fechas posteriores a la fecha_baja
    delete from public.asignacion_diaria_resuelta
    where empleado_id = new.id
      and fecha > v_fecha_baja;

    -- d) Eliminar cuotas diarias posteriores a la fecha de baja si existieran
    delete from public.cuota_asignacion_diaria_dc
    where empleado_id = new.id
      and fecha > v_fecha_baja;

    -- e) Eliminar resumen de cuotas mensuales de meses posteriores al mes de baja
    delete from public.cuota_mensual_resumen_dc
    where empleado_id = new.id
      and mes > to_char(v_fecha_baja, 'YYYY-MM-01')::date;

  end if;

  return new;
end;
$$;

-- 2. Crear trigger sobre la tabla empleado
drop trigger if exists trg_limpiar_impacto_baja_empleado on public.empleado;

create trigger trg_limpiar_impacto_baja_empleado
after insert or update of estatus_laboral, fecha_baja on public.empleado
for each row
execute function public.fn_limpiar_impacto_baja_empleado();

-- 3. Saneamiento retroactivo de empleados que ya tienen estatus_laboral = 'BAJA'
do $$
declare
  r record;
begin
  for r in
    select id, fecha_baja
    from public.empleado
    where estatus_laboral = 'BAJA' and fecha_baja is not null
  loop
    -- Cancelar asignaciones futuras
    update public.asignacion
    set
      estado_publicacion = 'BORRADOR',
      observaciones = case
        when observaciones is null or observaciones = '' then 'CANCELADA_POR_BAJA ' || r.fecha_baja::text
        when observaciones like '%CANCELADA_POR_BAJA%' then observaciones
        else observaciones || E'\nCANCELADA_POR_BAJA ' || r.fecha_baja::text
      end,
      updated_at = now()
    where empleado_id = r.id
      and (fecha_inicio > r.fecha_baja or (fecha_fin is not null and fecha_inicio > fecha_fin));

    -- Recortar asignaciones vigentes
    update public.asignacion
    set
      fecha_fin = r.fecha_baja,
      updated_at = now()
    where empleado_id = r.id
      and fecha_inicio <= r.fecha_baja
      and (fecha_fin is null or fecha_fin > r.fecha_baja);

    -- Limpiar asignacion_diaria_resuelta
    delete from public.asignacion_diaria_resuelta
    where empleado_id = r.id
      and fecha > r.fecha_baja;

    -- Limpiar cuotas diarias
    delete from public.cuota_asignacion_diaria_dc
    where empleado_id = r.id
      and fecha > r.fecha_baja;

    -- Limpiar cuotas mensuales posteriores
    delete from public.cuota_mensual_resumen_dc
    where empleado_id = r.id
      and mes > to_char(r.fecha_baja, 'YYYY-MM-01')::date;
  end loop;
end $$;
