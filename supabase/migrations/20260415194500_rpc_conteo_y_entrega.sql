-- [2026-04-15] RPC Conteo y Entrega Promocional (v2)
-- Este archivo agrega lógica de negocio específica para inventarios y entregas.

-- ==========================================
-- 1. REGISTRAR CONTEO JORNADA (Atómico)
-- ==========================================
create or replace function public.rpc_registrar_conteo_jornada(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_conteo_id uuid;
    v_detalle jsonb;
    v_item jsonb;
    v_prev_close_id uuid;
    v_prev_detail_item record;
    v_diff integer;
    v_has_diff boolean := false;
    v_clasificacion_diferencia text;
    v_observacion_diferencia text;
begin
    v_clasificacion_diferencia := p_datos->>'clasificacion_diferencia';
    v_observacion_diferencia := p_datos->>'observacion_diferencia';

    -- 1. Upsert del encabezado del conteo
    insert into public.material_conteo_jornada (
        cuenta_cliente_id, pdv_id, empleado_id, fecha_operacion, momento, observaciones, metadata
    ) values (
        (p_datos->>'cuenta_cliente_id')::uuid,
        (p_datos->>'pdv_id')::uuid,
        (p_datos->>'empleado_id')::uuid,
        (p_datos->>'fecha_operacion'),
        (p_datos->>'momento'),
        p_datos->>'observaciones',
        (p_datos->'metadata')::jsonb
    )
    on conflict (pdv_id, fecha_operacion, momento) 
    do update set
        observaciones = excluded.observaciones,
        metadata = public.material_conteo_jornada.metadata || excluded.metadata,
        updated_at = now()
    returning id into v_conteo_id;

    -- 2. Limpiar movimientos previos vinculados a este conteo (idempotencia)
    delete from public.material_inventario_movimiento where conteo_jornada_id = v_conteo_id;

    -- 3. Procesar detalles
    for v_item in select * from jsonb_array_elements(p_datos->'detalles') loop
        -- a. Upsert detalle
        insert into public.material_conteo_jornada_detalle (
            conteo_id, material_catalogo_id, cantidad_contada, metadata
        ) values (
            v_conteo_id,
            (v_item->>'material_catalogo_id')::uuid,
            (v_item->>'cantidad_contada')::integer,
            (v_item->'metadata')::jsonb
        )
        on conflict (conteo_id, material_catalogo_id)
        do update set
            cantidad_contada = excluded.cantidad_contada,
            metadata = public.material_conteo_jornada_detalle.metadata || excluded.metadata;

        -- b. Insertar movimiento neutro (registro de auditoría en inventario)
        insert into public.material_inventario_movimiento (
            cuenta_cliente_id, pdv_id, material_catalogo_id, conteo_jornada_id, empleado_id,
            tipo_movimiento, sentido, cantidad, cantidad_delta, motivo, observaciones
        ) values (
            (p_datos->>'cuenta_cliente_id')::uuid,
            (p_datos->>'pdv_id')::uuid,
            (v_item->>'material_catalogo_id')::uuid,
            v_conteo_id,
            (p_datos->>'empleado_id')::uuid,
            case when (p_datos->>'momento') = 'APERTURA' then 'APERTURA_JORNADA' else 'CIERRE_JORNADA' end,
            'NEUTRO',
            (v_item->>'cantidad_contada')::integer,
            0,
            'Conteo de ' || lower(p_datos->>'momento'),
            p_datos->>'observaciones'
        );
    end loop;

    -- 4. Si es APERTURA, gestionar diferencias contra el último CIERRE
    if (p_datos->>'momento') = 'APERTURA' then
        select id into v_prev_close_id
        from public.material_conteo_jornada
        where pdv_id = (p_datos->>'pdv_id')::uuid
          and momento = 'CIERRE'
          and fecha_operacion < (p_datos->>'fecha_operacion')
        order by fecha_operacion desc
        limit 1;

        if found then
            for v_prev_detail_item in 
                select material_catalogo_id, cantidad_contada 
                from public.material_conteo_jornada_detalle 
                where conteo_id = v_prev_close_id
            loop
                -- Buscar el item en el conteo actual
                select (v_item->>'cantidad_contada')::integer into v_diff
                from jsonb_array_elements(p_datos->'detalles') v_item
                where (v_item->>'material_catalogo_id')::uuid = v_prev_detail_item.material_catalogo_id;

                v_diff := coalesce(v_diff, 0) - v_prev_detail_item.cantidad_contada;

                if v_diff <> 0 then
                    v_has_diff := true;
                    -- Generar ajuste por diferencia fuera de turno
                    insert into public.material_inventario_movimiento (
                        cuenta_cliente_id, pdv_id, material_catalogo_id, conteo_jornada_id, empleado_id,
                        tipo_movimiento, sentido, cantidad, cantidad_delta, motivo, observaciones, metadata
                    ) values (
                        (p_datos->>'cuenta_cliente_id')::uuid,
                        (p_datos->>'pdv_id')::uuid,
                        v_prev_detail_item.material_catalogo_id,
                        v_conteo_id,
                        (p_datos->>'empleado_id')::uuid,
                        coalesce(v_clasificacion_diferencia, 'AJUSTE_FUERA_TURNO'),
                        case when v_diff > 0 then 'ENTRADA' else 'SALIDA' end,
                        abs(v_diff),
                        v_diff,
                        coalesce(v_observacion_diferencia, 'Diferencia detectada contra el ultimo cierre'),
                        v_observacion_diferencia,
                        jsonb_build_object('cierre_previo_id', v_prev_close_id)
                    );
                end if;
            end loop;
            
            if v_has_diff and (v_clasificacion_diferencia is null or v_observacion_diferencia is null) then
                raise exception 'La apertura tiene diferencias contra el cierre previo; registra clasificacion y explicacion.';
            end if;
        end if;
    end if;

    return jsonb_build_object('ok', true, 'id', v_conteo_id);
end;
$$;

-- ==========================================
-- 2. REGISTRAR ENTREGA PROMOCIONAL (Atómico)
-- ==========================================
create or replace function public.rpc_registrar_entrega_promocional(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_entrega_id uuid;
    v_saldo_actual integer;
begin
    -- 1. Validar saldo antes de insertar (Blindaje Extra)
    select coalesce(sum(cantidad_delta), 0) into v_saldo_actual
    from public.material_inventario_movimiento
    where pdv_id = (p_datos->>'pdv_id')::uuid
      and material_catalogo_id = (p_datos->>'material_catalogo_id')::uuid;

    if v_saldo_actual < (p_datos->>'cantidad_entregada')::integer then
        raise exception 'Insuficiente saldo para entregar (Disponible: %, Requerido: %)', v_saldo_actual, (p_datos->>'cantidad_entregada')::integer;
    end if;

    -- 2. Insertar record de entrega
    insert into public.material_entrega_promocional (
        cuenta_cliente_id, distribucion_id, distribucion_detalle_id, material_catalogo_id,
        empleado_id, pdv_id, cantidad_entregada, evidencia_material_url, evidencia_material_hash,
        evidencia_pdv_url, evidencia_pdv_hash, ticket_compra_url, ticket_compra_hash,
        observaciones, metadata
    ) values (
        (p_datos->>'cuenta_cliente_id')::uuid,
        (p_datos->>'distribucion_id')::uuid,
        (p_datos->>'distribucion_detalle_id')::uuid,
        (p_datos->>'material_catalogo_id')::uuid,
        (p_datos->>'empleado_id')::uuid,
        (p_datos->>'pdv_id')::uuid,
        (p_datos->>'cantidad_entregada')::integer,
        p_datos->>'evidencia_material_url',
        p_datos->>'evidencia_material_hash',
        p_datos->>'evidencia_pdv_url',
        p_datos->>'evidencia_pdv_hash',
        p_datos->>'ticket_compra_url',
        p_datos->>'ticket_compra_hash',
        p_datos->>'observaciones',
        (p_datos->'metadata')::jsonb
    ) returning id into v_entrega_id;

    -- 3. Insertar movimiento de salida
    insert into public.material_inventario_movimiento (
        cuenta_cliente_id, pdv_id, material_catalogo_id, distribucion_id, distribucion_detalle_id,
        empleado_id, tipo_movimiento, sentido, cantidad, cantidad_delta, motivo, observaciones, metadata
    ) values (
        (p_datos->>'cuenta_cliente_id')::uuid,
        (p_datos->>'pdv_id')::uuid,
        (p_datos->>'material_catalogo_id')::uuid,
        (p_datos->>'distribucion_id')::uuid,
        (p_datos->>'distribucion_detalle_id')::uuid,
        (p_datos->>'empleado_id')::uuid,
        'ENTREGA_CLIENTE',
        'SALIDA',
        (p_datos->>'cantidad_entregada')::integer,
        -((p_datos->>'cantidad_entregada')::integer),
        coalesce(p_datos->>'material_nombre_snapshot', 'Entrega a cliente final'),
        p_datos->>'observaciones',
        jsonb_build_object('entrega_id', v_entrega_id)
    );

    -- 4. Actualizar detalle de distribucion (acumulado)
    update public.material_distribucion_detalle
    set cantidad_entregada = coalesce(cantidad_entregada, 0) + (p_datos->>'cantidad_entregada')::integer
    where id = (p_datos->>'distribucion_detalle_id')::uuid;

    return jsonb_build_object('ok', true, 'id', v_entrega_id);
end;
$$;
