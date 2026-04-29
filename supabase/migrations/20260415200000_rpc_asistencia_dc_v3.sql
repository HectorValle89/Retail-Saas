-- [2026-04-15] RPC Asistencia DC (v3)
-- Este archivo robustece el registro de asistencia minimizando consultas previas.

-- ==========================================
-- 1. RESOLVER MISION DEL DIA (Interno RPC)
-- ==========================================
create or replace function public.rpc_internal_resolve_attendance_mission(
    p_empleado_id uuid,
    p_pdv_id uuid,
    p_fecha_operacion text
)
returns record
language plpgsql
security invoker
as $$
declare
    v_mission record;
    v_prev_mission_id uuid;
begin
    -- 1. Buscar misiones activas
    --    (Simplificamos la logica de src/features/asistencias/lib/attendanceMission.ts)
    
    -- a. Ultima mision usada
    select mision_dia_id into v_prev_mission_id
    from public.asistencia
    where empleado_id = p_empleado_id
      and pdv_id = p_pdv_id
      and mision_dia_id is not null
    order by fecha_operacion desc, created_at desc
    limit 1;

    -- b. Seleccionar mision rotativa
    select id, codigo, instruccion into v_mission
    from public.mision_dia
    where activa = true
      and (id <> v_prev_mission_id or v_prev_mission_id is null)
    order by orden asc, peso desc, created_at asc
    limit 1;

    -- c. Fallback si solo hay una mision
    if v_mission.id is null and v_prev_mission_id is not null then
        select id, codigo, instruccion into v_mission
        from public.mision_dia
        where activa = true
          and id = v_prev_mission_id;
    end if;

    return v_mission;
end;
$$;

-- ==========================================
-- 2. REGISTRAR ASISTENCIA DC (Atómico)
-- ==========================================
create or replace function public.rpc_registrar_asistencia_dc(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id uuid;
    v_asistencia_id uuid;
    v_assignment record;
    v_mission record;
    v_now timestamptz := now();
    v_fecha_operacion date;
begin
    v_id := (p_datos->>'id')::uuid;
    v_fecha_operacion := (p_datos->>'fecha_operacion')::date;

    -- 1. Validar Asignacion Activa (si es Check-in)
    if (p_datos->>'check_in_utc') is not null and (p_datos->>'check_out_utc') is null then
        select id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion 
        into v_assignment
        from public.asignacion
        where id = (p_datos->>'asignacion_id')::uuid
          and empleado_id = (p_datos->>'empleado_id')::uuid
          and pdv_id = (p_datos->>'pdv_id')::uuid
          and estado_publicacion = 'PUBLICADA'
          and fecha_inicio <= v_fecha_operacion
          and (fecha_fin >= v_fecha_operacion or fecha_fin is null);

        if not found then
            raise exception 'No existe una asignacion publicada y vigente para este check-in.';
        end if;
        
        -- 2. Resolver Mision si no viene inyectada
        if (p_datos->>'mision_dia_id') is null then
            select id, codigo, instruccion into v_mission 
            from public.rpc_internal_resolve_attendance_mission(
                (p_datos->>'empleado_id')::uuid,
                (p_datos->>'pdv_id')::uuid,
                p_datos->>'fecha_operacion'
            ) as (id uuid, codigo text, instruccion text);
            
            p_datos := p_datos || jsonb_build_object(
                'mision_dia_id', v_mission.id,
                'mision_codigo', v_mission.codigo,
                'mision_instruccion', v_mission.instruccion
            );
        end if;
    end if;

    -- 3. Upsert Asistencia
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
        check_out_utc = coalesce(excluded.check_out_utc, public.asistencia.check_out_utc),
        distancia_check_out_metros = coalesce(excluded.distancia_check_out_metros, public.asistencia.distancia_check_out_metros),
        latitud_check_out = coalesce(excluded.latitud_check_out, public.asistencia.latitud_check_out),
        longitud_check_out = coalesce(excluded.longitud_check_out, public.asistencia.longitud_check_out),
        selfie_check_out_url = coalesce(excluded.selfie_check_out_url, public.asistencia.selfie_check_out_url),
        selfie_check_out_hash = coalesce(excluded.selfie_check_out_hash, public.asistencia.selfie_check_out_hash),
        estatus = excluded.estatus,
        biometria_estado = coalesce(excluded.biometria_estado, public.asistencia.biometria_estado),
        biometria_score = coalesce(excluded.biometria_score, public.asistencia.biometria_score),
        metadata = public.asistencia.metadata || excluded.metadata,
        updated_at = v_now
    returning id into v_asistencia_id;

    -- 4. Registrar Audit Log (Evento Interno)
    insert into public.audit_log (
        tabla, registro_id, accion, payload, cuenta_cliente_id
    ) values (
        'asistencia',
        v_asistencia_id,
        'EVENTO',
        jsonb_build_object(
            'evento', case when (p_datos->>'check_out_utc') is not null then 'checkout_dc' else 'checkin_dc' end,
            'source', 'rpc_registrar_asistencia_dc'
        ),
        (p_datos->>'cuenta_cliente_id')::uuid
    );

    return jsonb_build_object(
        'ok', true, 
        'id', v_asistencia_id,
        'mision_dia_id', p_datos->>'mision_dia_id',
        'mision_codigo', p_datos->>'mision_codigo'
    );
end;
$$;
