-- Migración: Flexibilizar acuse firmado de última milla para receptor de cobertura general (TODOS)

create or replace function public.rpc_registrar_entrega_ultima_milla(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entrega_id uuid;
  v_existing_id uuid;
  v_estado text := 'SINCRONIZADA';
  v_has_discrepancy boolean := false;
  v_detail jsonb;
  v_evidence jsonb;
  v_real integer;
  v_distribution_id uuid;
  v_lote_id uuid;
  v_modo_entrega text := coalesce(p_datos->'metadata'->>'modo_entrega', 'ENTREGA_DC');
  v_receptor_origen text := coalesce(p_datos->'metadata'->>'receptor_origen', '');
begin
  v_entrega_id := coalesce((p_datos->>'id')::uuid, gen_random_uuid());

  select id into v_existing_id
  from public.material_entrega_ultima_milla
  where offline_client_id = p_datos->>'offline_client_id';

  if v_existing_id is not null then
    return jsonb_build_object('ok', true, 'id', v_existing_id, 'inserted', false);
  end if;

  if jsonb_array_length(coalesce(p_datos->'detalles', '[]'::jsonb)) = 0 then
    raise exception 'La entrega no contiene detalle de materiales.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(p_datos->'evidencias', '[]'::jsonb)) evidencia
    where evidencia->>'tipo' = 'ENTREGA_FISICA'
  ) then
    raise exception 'La evidencia de entrega fisica es obligatoria.';
  end if;

  if v_modo_entrega <> 'POR_CUBRIR' and v_receptor_origen <> 'TODOS' and not exists (
    select 1
    from jsonb_array_elements(coalesce(p_datos->'evidencias', '[]'::jsonb)) evidencia
    where evidencia->>'tipo' = 'ACUSE_FIRMADO'
  ) then
    raise exception 'Al menos un acuse firmado es obligatorio.';
  end if;

  select id, lote_id
  into v_distribution_id, v_lote_id
  from public.material_distribucion_mensual
  where id = (p_datos->>'distribucion_id')::uuid
  for update;

  if v_distribution_id is null then
    raise exception 'No existe la distribucion mensual indicada.';
  end if;

  for v_detail in select * from jsonb_array_elements(p_datos->'detalles') loop
    v_real := coalesce((v_detail->>'cantidad_real_recibida')::integer, (v_detail->>'cantidad_teorica')::integer);

    if v_detail->>'estado_item' = 'CON_DISCREPANCIA' and v_detail->>'cantidad_real_recibida' is null then
      raise exception 'La cantidad real es obligatoria cuando existe discrepancia.';
    end if;

    if v_detail->>'estado_item' = 'CON_DISCREPANCIA' or v_real <> (v_detail->>'cantidad_teorica')::integer then
      v_has_discrepancy := true;
    end if;
  end loop;

  if v_has_discrepancy then
    v_estado := 'CON_DISCREPANCIA';
  end if;

  insert into public.material_entrega_ultima_milla (
    id,
    cuenta_cliente_id,
    distribucion_id,
    pdv_id,
    cadena_id,
    supervisor_empleado_id,
    dermoconsejero_empleado_id,
    estado,
    pdv_snapshot,
    cadena_snapshot,
    dermoconsejero_snapshot,
    correccion_solicitada,
    latitud,
    longitud,
    gps_accuracy_metros,
    capturado_en,
    sincronizado_en,
    offline_client_id,
    metadata
  ) values (
    v_entrega_id,
    (p_datos->>'cuenta_cliente_id')::uuid,
    (p_datos->>'distribucion_id')::uuid,
    (p_datos->>'pdv_id')::uuid,
    nullif(p_datos->>'cadena_id', '')::uuid,
    (p_datos->>'supervisor_empleado_id')::uuid,
    nullif(p_datos->>'dermoconsejero_empleado_id', '')::uuid,
    v_estado,
    coalesce(p_datos->'pdv_snapshot', '{}'::jsonb),
    coalesce(p_datos->'cadena_snapshot', '{}'::jsonb),
    coalesce(p_datos->'dermoconsejero_snapshot', '{}'::jsonb),
    coalesce(p_datos->'correccion_solicitada', '{}'::jsonb),
    nullif(p_datos->>'latitud', '')::numeric,
    nullif(p_datos->>'longitud', '')::numeric,
    nullif(p_datos->>'gps_accuracy_metros', '')::numeric,
    coalesce((p_datos->>'capturado_en')::timestamptz, now()),
    now(),
    p_datos->>'offline_client_id',
    coalesce(p_datos->'metadata', '{}'::jsonb)
  );

  for v_detail in select * from jsonb_array_elements(p_datos->'detalles') loop
    v_real := coalesce((v_detail->>'cantidad_real_recibida')::integer, (v_detail->>'cantidad_teorica')::integer);

    insert into public.material_entrega_ultima_milla_detalle (
      entrega_id,
      distribucion_detalle_id,
      material_catalogo_id,
      cantidad_teorica,
      estado_item,
      cantidad_real_recibida,
      observaciones,
      metadata
    ) values (
      v_entrega_id,
      (v_detail->>'distribucion_detalle_id')::uuid,
      (v_detail->>'material_catalogo_id')::uuid,
      (v_detail->>'cantidad_teorica')::integer,
      v_detail->>'estado_item',
      v_real,
      nullif(v_detail->>'observaciones', ''),
      coalesce(v_detail->'metadata', '{}'::jsonb)
    );

    update public.material_distribucion_detalle
    set cantidad_recibida = v_real,
        cantidad_observada = abs(v_real - (v_detail->>'cantidad_teorica')::integer),
        observaciones = coalesce(nullif(v_detail->>'observaciones', ''), observaciones),
        metadata = metadata || jsonb_build_object(
          'ultima_milla_entrega_id', v_entrega_id,
          'ultima_milla_offline_client_id', p_datos->>'offline_client_id'
        )
    where id = (v_detail->>'distribucion_detalle_id')::uuid;

    if v_real > 0 then
      insert into public.material_inventario_movimiento (
        cuenta_cliente_id,
        pdv_id,
        material_catalogo_id,
        lote_id,
        distribucion_id,
        distribucion_detalle_id,
        empleado_id,
        tipo_movimiento,
        sentido,
        cantidad,
        cantidad_delta,
        motivo,
        observaciones,
        metadata
      ) values (
        (p_datos->>'cuenta_cliente_id')::uuid,
        (p_datos->>'pdv_id')::uuid,
        (v_detail->>'material_catalogo_id')::uuid,
        v_lote_id,
        (p_datos->>'distribucion_id')::uuid,
        (v_detail->>'distribucion_detalle_id')::uuid,
        (p_datos->>'supervisor_empleado_id')::uuid,
        'RECEPCION_LOTE',
        'ENTRADA',
        v_real,
        v_real,
        case when v_modo_entrega = 'POR_CUBRIR' then 'Resguardo ultima milla' else 'Entrega ultima milla' end,
        nullif(v_detail->>'observaciones', ''),
        jsonb_build_object(
          'ultima_milla_entrega_id', v_entrega_id,
          'offline_client_id', p_datos->>'offline_client_id',
          'cantidad_teorica', (v_detail->>'cantidad_teorica')::integer,
          'modo_entrega', v_modo_entrega
        )
      );
    end if;
  end loop;

  for v_evidence in select * from jsonb_array_elements(p_datos->'evidencias') loop
    insert into public.material_entrega_ultima_milla_evidencia (
      entrega_id,
      tipo,
      archivo_hash_id,
      bucket,
      ruta_archivo,
      thumbnail_url,
      capturada_en,
      latitud,
      longitud,
      gps_accuracy_metros,
      orden,
      metadata
    ) values (
      v_entrega_id,
      v_evidence->>'tipo',
      nullif(v_evidence->>'archivo_hash_id', '')::uuid,
      nullif(v_evidence->>'bucket', ''),
      nullif(v_evidence->>'ruta_archivo', ''),
      nullif(v_evidence->>'thumbnail_url', ''),
      coalesce((v_evidence->>'capturada_en')::timestamptz, now()),
      nullif(v_evidence->>'latitud', '')::numeric,
      nullif(v_evidence->>'longitud', '')::numeric,
      nullif(v_evidence->>'gps_accuracy_metros', '')::numeric,
      coalesce((v_evidence->>'orden')::integer, 1),
      coalesce(v_evidence->'metadata', '{}'::jsonb)
    );
  end loop;

  update public.material_distribucion_mensual
  set estado = case when v_has_discrepancy then 'RECIBIDA_CON_OBSERVACIONES' else 'RECIBIDA_CONFORME' end,
      confirmado_por_empleado_id = (p_datos->>'supervisor_empleado_id')::uuid,
      confirmado_en = now(),
      observaciones = coalesce(nullif(p_datos->>'observaciones', ''), observaciones),
      metadata = metadata || jsonb_build_object(
        'ultima_milla_entrega_id', v_entrega_id,
        'ultima_milla_estado', v_estado,
        'ultima_milla_modo_entrega', v_modo_entrega
      )
  where id = (p_datos->>'distribucion_id')::uuid;

  return jsonb_build_object(
    'ok', true,
    'id', v_entrega_id,
    'inserted', true,
    'estado', v_estado
  );
end;
$$;

create or replace function public.rpc_corregir_entrega_ultima_milla(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entrega public.material_entrega_ultima_milla%rowtype;
  v_estado text := 'SINCRONIZADA';
  v_has_discrepancy boolean := false;
  v_detail jsonb;
  v_evidence jsonb;
  v_real integer;
  v_old_real integer;
  v_delta integer;
  v_lote_id uuid;
  v_correction_client_id text := nullif(p_datos->>'correccion_client_id', '');
  v_replace_entrega boolean := coalesce((p_datos->>'reemplazar_evidencia_entrega')::boolean, false);
  v_replace_acuses boolean := coalesce((p_datos->>'reemplazar_acuses')::boolean, false);
  v_modo_entrega text := coalesce(p_datos->'metadata'->>'modo_entrega', 'ENTREGA_DC');
  v_receptor_origen text := '';
begin
  select *
  into v_entrega
  from public.material_entrega_ultima_milla
  where id = (p_datos->>'entrega_id')::uuid
  for update;

  if v_entrega.id is null then
    raise exception 'No existe la entrega de ultima milla indicada.';
  end if;

  v_modo_entrega := coalesce(p_datos->'metadata'->>'modo_entrega', v_entrega.metadata->>'modo_entrega', 'ENTREGA_DC');
  v_receptor_origen := coalesce(p_datos->'metadata'->>'receptor_origen', v_entrega.metadata->>'receptor_origen', '');

  if v_correction_client_id is not null
     and v_entrega.metadata->>'ultima_correccion_client_id' = v_correction_client_id then
    return jsonb_build_object(
      'ok', true,
      'id', v_entrega.id,
      'inserted', false,
      'corrected', false,
      'estado', v_entrega.estado
    );
  end if;

  if jsonb_array_length(coalesce(p_datos->'detalles', '[]'::jsonb)) = 0 then
    raise exception 'La correccion no contiene detalle de materiales.';
  end if;

  select lote_id
  into v_lote_id
  from public.material_distribucion_mensual
  where id = v_entrega.distribucion_id
  for update;

  for v_detail in select * from jsonb_array_elements(p_datos->'detalles') loop
    v_real := coalesce((v_detail->>'cantidad_real_recibida')::integer, (v_detail->>'cantidad_teorica')::integer);

    if v_detail->>'estado_item' = 'CON_DISCREPANCIA' and v_detail->>'cantidad_real_recibida' is null then
      raise exception 'La cantidad real es obligatoria cuando existe discrepancia.';
    end if;

    if v_detail->>'estado_item' = 'CON_DISCREPANCIA' or v_real <> (v_detail->>'cantidad_teorica')::integer then
      v_has_discrepancy := true;
    end if;
  end loop;

  if v_has_discrepancy then
    v_estado := 'CON_DISCREPANCIA';
  end if;

  update public.material_entrega_ultima_milla
  set estado = v_estado,
      dermoconsejero_empleado_id = case
        when v_modo_entrega = 'POR_CUBRIR' then null
        else coalesce(nullif(p_datos->>'dermoconsejero_empleado_id', '')::uuid, dermoconsejero_empleado_id)
      end,
      dermoconsejero_snapshot = case
        when p_datos ? 'dermoconsejero_snapshot'
          then coalesce(p_datos->'dermoconsejero_snapshot', '{}'::jsonb)
        else dermoconsejero_snapshot
      end,
      latitud = coalesce(nullif(p_datos->>'latitud', '')::numeric, latitud),
      longitud = coalesce(nullif(p_datos->>'longitud', '')::numeric, longitud),
      gps_accuracy_metros = coalesce(nullif(p_datos->>'gps_accuracy_metros', '')::numeric, gps_accuracy_metros),
      sincronizado_en = now(),
      correccion_solicitada = '{}'::jsonb,
      metadata = metadata || coalesce(p_datos->'metadata', '{}'::jsonb) || jsonb_build_object(
        'ultima_correccion_en', now(),
        'ultima_correccion_client_id', v_correction_client_id,
        'ultima_correccion_por_usuario_id', nullif(p_datos->'metadata'->>'sincronizado_por_usuario_id', ''),
        'ultima_correccion_offline_client_id', nullif(p_datos->>'offline_client_id', ''),
        'receptor_anterior_empleado_id', v_entrega.dermoconsejero_empleado_id,
        'receptor_corregido_empleado_id', case when v_modo_entrega = 'POR_CUBRIR' then null else nullif(p_datos->>'dermoconsejero_empleado_id', '') end
      )
  where id = v_entrega.id;

  for v_detail in select * from jsonb_array_elements(p_datos->'detalles') loop
    v_real := coalesce((v_detail->>'cantidad_real_recibida')::integer, (v_detail->>'cantidad_teorica')::integer);

    select coalesce(cantidad_real_recibida, cantidad_teorica)
    into v_old_real
    from public.material_entrega_ultima_milla_detalle
    where entrega_id = v_entrega.id
      and distribucion_detalle_id = (v_detail->>'distribucion_detalle_id')::uuid
    for update;

    if v_old_real is null then
      raise exception 'La entrega no contiene el detalle de material indicado.';
    end if;

    v_delta := v_real - v_old_real;

    update public.material_entrega_ultima_milla_detalle
    set cantidad_teorica = (v_detail->>'cantidad_teorica')::integer,
        estado_item = v_detail->>'estado_item',
        cantidad_real_recibida = v_real,
        observaciones = nullif(v_detail->>'observaciones', ''),
        metadata = metadata || jsonb_build_object(
          'corregido_en', now(),
          'correccion_client_id', v_correction_client_id,
          'cantidad_real_anterior', v_old_real
        )
    where entrega_id = v_entrega.id
      and distribucion_detalle_id = (v_detail->>'distribucion_detalle_id')::uuid;

    update public.material_distribucion_detalle
    set cantidad_recibida = v_real,
        cantidad_observada = abs(v_real - (v_detail->>'cantidad_teorica')::integer),
        observaciones = coalesce(nullif(v_detail->>'observaciones', ''), observaciones),
        metadata = metadata || jsonb_build_object(
          'ultima_milla_entrega_id', v_entrega.id,
          'ultima_milla_correccion_client_id', v_correction_client_id,
          'ultima_milla_corregida_en', now()
        )
    where id = (v_detail->>'distribucion_detalle_id')::uuid;

    if v_delta <> 0 then
      insert into public.material_inventario_movimiento (
        cuenta_cliente_id,
        pdv_id,
        material_catalogo_id,
        lote_id,
        distribucion_id,
        distribucion_detalle_id,
        empleado_id,
        tipo_movimiento,
        sentido,
        cantidad,
        cantidad_delta,
        motivo,
        observaciones,
        metadata
      ) values (
        v_entrega.cuenta_cliente_id,
        v_entrega.pdv_id,
        (v_detail->>'material_catalogo_id')::uuid,
        v_lote_id,
        v_entrega.distribucion_id,
        (v_detail->>'distribucion_detalle_id')::uuid,
        v_entrega.supervisor_empleado_id,
        'AJUSTE_FUERA_TURNO',
        case when v_delta > 0 then 'ENTRADA' else 'SALIDA' end,
        abs(v_delta),
        v_delta,
        case when v_modo_entrega = 'POR_CUBRIR' then 'Correccion resguardo ultima milla' else 'Correccion ultima milla' end,
        nullif(v_detail->>'observaciones', ''),
        jsonb_build_object(
          'ultima_milla_entrega_id', v_entrega.id,
          'correccion_client_id', v_correction_client_id,
          'cantidad_real_anterior', v_old_real,
          'cantidad_real_nueva', v_real,
          'modo_entrega', v_modo_entrega
        )
      );
    end if;
  end loop;

  if v_replace_entrega then
    delete from public.material_entrega_ultima_milla_evidencia
    where entrega_id = v_entrega.id
      and tipo = 'ENTREGA_FISICA';
  end if;

  if v_replace_acuses then
    delete from public.material_entrega_ultima_milla_evidencia
    where entrega_id = v_entrega.id
      and tipo = 'ACUSE_FIRMADO';
  end if;

  for v_evidence in select * from jsonb_array_elements(coalesce(p_datos->'evidencias', '[]'::jsonb)) loop
    insert into public.material_entrega_ultima_milla_evidencia (
      entrega_id,
      tipo,
      archivo_hash_id,
      bucket,
      ruta_archivo,
      thumbnail_url,
      capturada_en,
      latitud,
      longitud,
      gps_accuracy_metros,
      orden,
      metadata
    ) values (
      v_entrega.id,
      v_evidence->>'tipo',
      nullif(v_evidence->>'archivo_hash_id', '')::uuid,
      nullif(v_evidence->>'bucket', ''),
      nullif(v_evidence->>'ruta_archivo', ''),
      nullif(v_evidence->>'thumbnail_url', ''),
      coalesce((v_evidence->>'capturada_en')::timestamptz, now()),
      nullif(v_evidence->>'latitud', '')::numeric,
      nullif(v_evidence->>'longitud', '')::numeric,
      nullif(v_evidence->>'gps_accuracy_metros', '')::numeric,
      coalesce((v_evidence->>'orden')::integer, 1),
      coalesce(v_evidence->'metadata', '{}'::jsonb) || jsonb_build_object(
        'reemplazo_correccion_client_id', v_correction_client_id,
        'reemplazo_correccion_en', now()
      )
    );
  end loop;

  if not exists (
    select 1
    from public.material_entrega_ultima_milla_evidencia
    where entrega_id = v_entrega.id
      and tipo = 'ENTREGA_FISICA'
  ) then
    raise exception 'La correccion debe conservar o reemplazar la evidencia de entrega fisica.';
  end if;

  if v_modo_entrega <> 'POR_CUBRIR' and v_receptor_origen <> 'TODOS' and not exists (
    select 1
    from public.material_entrega_ultima_milla_evidencia
    where entrega_id = v_entrega.id
      and tipo = 'ACUSE_FIRMADO'
  ) then
    raise exception 'La correccion debe conservar o reemplazar al menos un acuse firmado.';
  end if;

  update public.material_distribucion_mensual
  set estado = case when v_has_discrepancy then 'RECIBIDA_CON_OBSERVACIONES' else 'RECIBIDA_CONFORME' end,
      confirmado_por_empleado_id = v_entrega.supervisor_empleado_id,
      confirmado_en = now(),
      observaciones = coalesce(nullif(p_datos->>'observaciones', ''), observaciones),
      metadata = metadata || jsonb_build_object(
        'ultima_milla_entrega_id', v_entrega.id,
        'ultima_milla_estado', v_estado,
        'ultima_milla_corregida_en', now(),
        'ultima_milla_correccion_client_id', v_correction_client_id,
        'ultima_milla_modo_entrega', v_modo_entrega,
        'ultima_milla_receptor_corregido_empleado_id', case when v_modo_entrega = 'POR_CUBRIR' then null else nullif(p_datos->>'dermoconsejero_empleado_id', '') end
      )
  where id = v_entrega.distribucion_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_entrega.id,
    'inserted', false,
    'corrected', true,
    'estado', v_estado
  );
end;
$$;
