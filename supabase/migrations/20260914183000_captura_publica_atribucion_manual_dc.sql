-- Permite atribuir una captura pública a la DC que declara haber realizado la jornada.
-- La excepción no altera la asignación estructural ni la publicación vigente del PDV.

create or replace function public.fn_captura_publica_atribucion_efectiva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atribucion record;
  v_atribucion_manual boolean := coalesce(new.metadata ->> 'atribucion_manual_declarada', 'false') = 'true';
begin
  select * into v_atribucion
  from public.resolver_atribucion_captura_publica(
    new.cuenta_cliente_id,
    new.empleado_id,
    new.pdv_id,
    new.fecha_operativa
  );

  -- Una declaración manual conserva la asignación estructural intacta. Sólo usa
  -- el resolvedor para obtener el supervisor efectivo del PDV en esa fecha.
  if v_atribucion_manual then
    new.asignacion_id := null;
    new.supervisor_empleado_id := v_atribucion.supervisor_empleado_id;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'atribucion_operativa',
      jsonb_build_object(
        'version', 2,
        'origen', 'DECLARACION_MANUAL_DC',
        'asignacion_id', null,
        'supervisor_empleado_id', v_atribucion.supervisor_empleado_id,
        'fecha_operativa', new.fecha_operativa
      )
    );
    return new;
  end if;

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
