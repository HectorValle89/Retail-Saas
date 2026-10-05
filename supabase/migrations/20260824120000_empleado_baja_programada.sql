-- Activa bajas preaprobadas en su primer dia inactivo sin adelantar el corte de acceso.
-- La fecha_baja se interpreta como primer dia inactivo; el ultimo dia laborado queda
-- conservado en empleado.metadata.ultimo_dia_laborado.

create index if not exists idx_empleado_baja_programada_fecha
  on public.empleado (fecha_baja, id)
  where fecha_baja is not null
    and (metadata ->> 'workflow_stage') = 'BAJA_PROGRAMADA';

create or replace function public.aplicar_bajas_empleado_vigentes(
  p_fecha date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_count integer := 0;
  v_cuenta_cliente_id uuid;
begin
  for v_row in
    select e.id, e.nombre_completo, e.fecha_baja
    from public.empleado e
    where e.fecha_baja is not null
      and e.fecha_baja <= p_fecha
      and (e.metadata ->> 'workflow_stage') = 'BAJA_PROGRAMADA'
    order by e.fecha_baja, e.id
    for update skip locked
  loop
    select u.cuenta_cliente_id
    into v_cuenta_cliente_id
    from public.usuario u
    where u.empleado_id = v_row.id
    order by u.created_at
    limit 1;

    update public.empleado e
    set estatus_laboral = 'BAJA',
        metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
          'workflow_stage', 'BAJA_IMSS_CERRADA',
          'baja_programada', false,
          'baja_effective_applied_at', now()
        ),
        updated_at = now()
    where e.id = v_row.id;

    update public.usuario u
    set estado_cuenta = 'BAJA',
        updated_at = now()
    where u.empleado_id = v_row.id
      and u.estado_cuenta <> 'BAJA';

    insert into public.audit_log (
      tabla,
      registro_id,
      accion,
      payload,
      usuario_id,
      cuenta_cliente_id
    ) values (
      'empleado',
      v_row.id::text,
      'EVENTO',
      jsonb_build_object(
        'evento', 'empleado_baja_programada_aplicada',
        'nombre', v_row.nombre_completo,
        'fecha_baja', v_row.fecha_baja,
        'fecha_proceso', p_fecha
      ),
      null,
      v_cuenta_cliente_id
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.aplicar_bajas_empleado_vigentes(date) is
  'Convierte bajas programadas a BAJA desde su primer dia inactivo y revoca el acceso operativo.';

revoke all on function public.aplicar_bajas_empleado_vigentes(date)
  from public, anon, authenticated;
grant execute on function public.aplicar_bajas_empleado_vigentes(date) to service_role;
