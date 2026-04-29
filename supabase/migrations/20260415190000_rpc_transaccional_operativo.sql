-- [2026-04-15] RPC Transaccional Operativo
-- Este archivo centraliza la lógica de negocio en el backend para reducir round-trips de red.

-- ==========================================
-- 1. REGISTRAR VENTA
-- ==========================================
create or replace function public.rpc_registrar_venta(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id uuid;
    v_cuenta_activa boolean;
    v_asistencia record;
    v_venta_existente_id uuid;
    v_inserted boolean := false;
    v_replaced boolean := false;
    v_resultado jsonb;
begin
    -- 1. Validar cuenta activa
    select activa into v_cuenta_activa 
    from public.cuenta_cliente 
    where id = (p_datos->>'cuenta_cliente_id')::uuid;
    
    if not v_cuenta_activa then
        raise exception 'La cuenta cliente no existe o no esta activa.';
    end if;

    -- 2. Validar asistencia (contexto operativo)
    select * into v_asistencia 
    from public.asistencia 
    where id = (p_datos->>'asistencia_id')::uuid;

    if not found then
        raise exception 'La jornada del dia ya no esta disponible.';
    end if;

    if v_asistencia.estatus = 'RECHAZADA' or v_asistencia.check_in_utc is null then
        raise exception 'No existe un check-in valido para registrar ventas.';
    end if;

    if v_asistencia.cuenta_cliente_id <> (p_datos->>'cuenta_cliente_id')::uuid or
       v_asistencia.empleado_id <> (p_datos->>'empleado_id')::uuid or
       v_asistencia.pdv_id <> (p_datos->>'pdv_id')::uuid then
        raise exception 'La jornada no coincide con el contexto de la venta.';
    end if;

    -- 3. Idempotencia por ID (si se provee)
    if p_datos->>'id' is not null then
        select id into v_venta_existente_id 
        from public.venta 
        where id = (p_datos->>'id')::uuid;
        
        if found then
            return jsonb_build_object(
                'ok', true,
                'id', v_venta_existente_id,
                'inserted', false,
                'replacedExisting', true,
                'fecha_operacion', v_asistencia.fecha_operacion
            );
        end if;
    end if;

    -- 4. Buscar duplicado del mismo dia/empleado/pdv/producto para reemplazo (UPSERT funcional)
    --    Seguimos la regla de ventaRegistration.ts
    select id into v_venta_existente_id
    from public.venta
    where empleado_id = (p_datos->>'empleado_id')::uuid
      and pdv_id = (p_datos->>'pdv_id')::uuid
      and producto_id = (p_datos->>'producto_id')::uuid
      and (metadata->>'fecha_operativa') = v_asistencia.fecha_operacion
    limit 1;

    if v_venta_existente_id is not null then
        update public.venta set
            total_unidades = (p_datos->>'total_unidades')::integer,
            total_monto = (p_datos->>'total_monto')::decimal,
            confirmada = (p_datos->>'confirmada')::boolean,
            validada_por_empleado_id = (p_datos->>'validada_por_empleado_id')::uuid,
            validada_en = (p_datos->>'validada_en')::timestamptz,
            observaciones = p_datos->>'observaciones',
            metadata = (p_datos->'metadata')::jsonb,
            updated_at = now()
        where id = v_venta_existente_id;
        
        v_id := v_venta_existente_id;
        v_replaced := true;
    else
        insert into public.venta (
            id,
            cuenta_cliente_id,
            asistencia_id,
            empleado_id,
            pdv_id,
            producto_id,
            producto_sku,
            producto_nombre,
            producto_nombre_corto,
            fecha_utc,
            total_unidades,
            total_monto,
            confirmada,
            validada_por_empleado_id,
            validada_en,
            observaciones,
            origen,
            metadata
        ) values (
            coalesce((p_datos->>'id')::uuid, gen_random_uuid()),
            (p_datos->>'cuenta_cliente_id')::uuid,
            (p_datos->>'asistencia_id')::uuid,
            (p_datos->>'empleado_id')::uuid,
            (p_datos->>'pdv_id')::uuid,
            (p_datos->>'producto_id')::uuid,
            (p_datos->>'producto_sku'),
            (p_datos->>'producto_nombre'),
            (p_datos->>'producto_nombre_corto'),
            (p_datos->>'fecha_utc')::timestamptz,
            (p_datos->>'total_unidades')::integer,
            (p_datos->>'total_monto')::decimal,
            (p_datos->>'confirmada')::boolean,
            (p_datos->>'validada_por_empleado_id')::uuid,
            (p_datos->>'validada_en')::timestamptz,
            p_datos->>'observaciones',
            (p_datos->>'origen'),
            (p_datos->'metadata')::jsonb
        ) returning id into v_id;
        
        v_inserted := true;
    end if;

    return jsonb_build_object(
        'ok', true,
        'id', v_id,
        'inserted', v_inserted,
        'replacedExisting', v_replaced,
        'fecha_operacion', v_asistencia.fecha_operacion
    );
end;
$$;

-- ==========================================
-- 2. REGISTRAR MOVIMIENTO INVENTARIO
-- ==========================================
create or replace function public.rpc_registrar_movimiento_inventario(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_saldo_actual integer := 0;
    v_id uuid;
    v_cantidad integer;
    v_sentido text;
begin
    v_cantidad := (p_datos->>'cantidad')::integer;
    v_sentido := p_datos->>'sentido';

    -- 1. Calcular saldo actual (lectura blindada)
    --    Usamos SECURITY DEFINER internamente si hay RLS restrictivo en movimientos, 
    --    pero aqui asumimos que el usuario puede leer su propio inventario.
    select coalesce(sum(cantidad_delta), 0) into v_saldo_actual
    from public.material_inventario_movimiento
    where pdv_id = (p_datos->>'pdv_id')::uuid
      and material_catalogo_id = (p_datos->>'material_catalogo_id')::uuid;

    -- 2. Validar stock para salidas
    if v_sentido = 'SALIDA' and v_cantidad > v_saldo_actual then
        raise exception 'Solo hay % pieza(s) disponible(s) en este PDV.', v_saldo_actual;
    end if;

    -- 3. Insertar movimiento
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
        (p_datos->>'material_catalogo_id')::uuid,
        (p_datos->>'lote_id')::uuid,
        (p_datos->>'distribucion_id')::uuid,
        (p_datos->>'distribucion_detalle_id')::uuid,
        (p_datos->>'empleado_id')::uuid,
        (p_datos->>'tipo_movimiento'),
        v_sentido,
        v_cantidad,
        case when v_sentido = 'SALIDA' then -v_cantidad else v_cantidad end,
        p_datos->>'motivo',
        p_datos->>'observaciones',
        (p_datos->'metadata')::jsonb
    ) returning id into v_id;

    -- 4. Si es una entrega promocional, actualizar el detalle de distribucion
    if (p_datos->>'distribucion_detalle_id') is not null and (p_datos->>'tipo_movimiento') = 'ENTREGA_CLIENTE' then
        update public.material_distribucion_detalle
        set cantidad_entregada = coalesce(cantidad_entregada, 0) + v_cantidad
        where id = (p_datos->>'distribucion_detalle_id')::uuid;
    end if;

    return jsonb_build_object(
        'ok', true,
        'id', v_id,
        'saldo_nuevo', v_saldo_actual + (case when v_sentido = 'SALIDA' then -v_cantidad else v_cantidad end)
    );
end;
$$;

-- ==========================================
-- 3. REGISTRAR ASISTENCIA DC (Check-in/out)
-- ==========================================
create or replace function public.rpc_registrar_asistencia_dc(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id uuid;
begin
    v_id := (p_datos->>'id')::uuid;
    
    -- 1. Upsert de la asistencia
    --    Usamos insert ... on conflict para manejar el sync offline idempotente
    insert into public.asistencia (
        id, cuenta_cliente_id, asignacion_id, empleado_id, pdv_id, 
        fecha_operacion, check_in_utc, check_out_utc, 
        distancia_check_in_metros, distancia_check_out_metros,
        latitud_check_in, longitud_check_in,
        latitud_check_out, longitud_check_out,
        estado_gps, biometria_estado, biometria_score,
        selfie_check_in_url, selfie_check_in_hash,
        selfie_check_out_url, selfie_check_out_hash,
        justificacion_fuera_geocerca, estatus,
        mision_dia_id, mision_codigo, mision_instruccion,
        origen, metadata
    ) values (
        v_id,
        (p_datos->>'cuenta_cliente_id')::uuid,
        (p_datos->>'asignacion_id')::uuid,
        (p_datos->>'empleado_id')::uuid,
        (p_datos->>'pdv_id')::uuid,
        (p_datos->>'fecha_operacion')::date,
        (p_datos->>'check_in_utc')::timestamptz,
        (p_datos->>'check_out_utc')::timestamptz,
        (p_datos->>'distancia_check_in_metros')::numeric,
        (p_datos->>'distancia_check_out_metros')::numeric,
        (p_datos->>'latitud_check_in')::numeric,
        (p_datos->>'longitud_check_in')::numeric,
        (p_datos->>'latitud_check_out')::numeric,
        (p_datos->>'longitud_check_out')::numeric,
        (p_datos->>'estado_gps'),
        (p_datos->>'biometria_estado'),
        (p_datos->>'biometria_score')::numeric,
        (p_datos->>'selfie_check_in_url'),
        (p_datos->>'selfie_check_in_hash'),
        (p_datos->>'selfie_check_out_url'),
        (p_datos->>'selfie_check_out_hash'),
        (p_datos->>'justificacion_fuera_geocerca'),
        (p_datos->>'estatus'),
        (p_datos->>'mision_dia_id')::uuid,
        (p_datos->>'mision_codigo'),
        (p_datos->>'mision_instruccion'),
        (p_datos->>'origen'),
        (p_datos->'metadata')::jsonb
    )
    on conflict (id) do update set
        check_out_utc = coalesce(public.asistencia.check_out_utc, excluded.check_out_utc),
        distancia_check_out_metros = coalesce(public.asistencia.distancia_check_out_metros, excluded.distancia_check_out_metros),
        latitud_check_out = coalesce(public.asistencia.latitud_check_out, excluded.latitud_check_out),
        longitud_check_out = coalesce(public.asistencia.longitud_check_out, excluded.longitud_check_out),
        selfie_check_out_url = coalesce(public.asistencia.selfie_check_out_url, excluded.selfie_check_out_url),
        selfie_check_out_hash = coalesce(public.asistencia.selfie_check_out_hash, excluded.selfie_check_out_hash),
        estatus = excluded.estatus,
        metadata = public.asistencia.metadata || excluded.metadata,
        updated_at = now();

    return jsonb_build_object(
        'ok', true,
        'id', v_id,
        'fecha_operacion', (p_datos->>'fecha_operacion')
    );
end;
$$;

-- ==========================================
-- 4. REGISTRAR ACCION RUTA SUPERVISOR
-- ==========================================
create or replace function public.rpc_registrar_accion_ruta_supervisor(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_tipo_objetivo text;
    v_id uuid;
begin
    v_tipo_objetivo := p_datos->>'tipo_objetivo'; -- 'VISITA' o 'EVENTO'
    v_id := (p_datos->>'id')::uuid;

    if v_tipo_objetivo = 'VISITA' then
        update public.ruta_semanal_visita set
            estatus = (p_datos->>'estatus'),
            selfie_url = p_datos->>'selfie_url',
            evidencia_url = p_datos->>'evidencia_url',
            checklist_calidad = (p_datos->'checklist')::jsonb,
            comentarios = p_datos->>'comentarios',
            completada_en = now(),
            updated_at = now()
        where id = v_id;
    elsif v_tipo_objetivo = 'EVENTO' then
        update public.ruta_agenda_evento set
            estatus_ejecucion = (p_datos->>'estatus_ejecucion'),
            check_in_en = (p_datos->>'check_in_en')::timestamptz,
            check_out_en = (p_datos->>'check_out_en')::timestamptz,
            selfie_url = p_datos->>'selfie_url',
            evidencia_url = p_datos->>'evidencia_url',
            metadata = public.ruta_agenda_evento.metadata || (p_datos->'metadata')::jsonb,
            updated_at = now()
        where id = v_id;
    else
        raise exception 'Tipo de objetivo de ruta no valido.';
    end if;

    return jsonb_build_object(
        'ok', true,
        'id', v_id,
        'tipo', v_tipo_objetivo
    );
end;
$$;
