-- Alinea el texto histórico mostrado en el reporte con el traslado operativo ya aplicado.
begin;

do $$
declare
  v_cuenta uuid;
  v_olga uuid;
  v_durango uuid;
  v_polanco uuid;
  v_count integer;
begin
  select id into strict v_olga
  from public.empleado
  where nombre_completo = 'OLGA ELIZABETH RODRIGUEZ BAILON';

  select id into strict v_durango
  from public.pdv
  where clave_btl = 'BTL-PAL-DURA-0M';

  select id into strict v_polanco
  from public.pdv
  where clave_btl = 'BTL-PAL-POLA-MF';

  select cuenta_cliente_id into strict v_cuenta
  from public.asignacion
  where empleado_id = v_olga
    and pdv_id = v_durango
    and fecha_inicio = date '2026-08-01'
    and fecha_fin = date '2026-08-31'
    and estado_publicacion = 'PUBLICADA'
  order by created_at desc
  limit 1;

  update public.captura_publica_registro
  set pdv_nombre_snapshot = 'Palacio Durango',
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_olga
    and pdv_id = v_durango
    and fecha_operativa between date '2026-08-01' and date '2026-08-31'
    and pdv_nombre_snapshot = 'Palacio Polanco';
  get diagnostics v_count = row_count;

  insert into public.audit_log (tabla, registro_id, accion, payload, usuario_id, cuenta_cliente_id)
  values (
    'captura_publica_registro',
    v_olga::text,
    'EVENTO',
    jsonb_build_object(
      'tipo', 'CORRECCION_SNAPSHOT_TRASLADO',
      'pdv_origen_id', v_polanco,
      'pdv_destino_id', v_durango,
      'registros_actualizados', v_count,
      'fecha_inicio', '2026-08-01',
      'fecha_fin', '2026-08-31'
    ),
    null,
    v_cuenta
  );
end;
$$;

commit;
