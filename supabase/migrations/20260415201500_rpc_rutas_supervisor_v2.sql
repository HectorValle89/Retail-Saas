-- [2026-04-15] RPC Rutas Supervisor (v3)
-- Este archivo agrega la lógica atómica para el cierre de visitas y eventos de agenda con nombres de campo correctos.

-- ==========================================
-- 1. REGISTRAR ACCION RUTA (Atómico)
-- ==========================================
create or replace function public.rpc_registrar_accion_ruta_supervisor(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id uuid;
    v_tipo text; -- 'VISITA' o 'EVENTO'
    v_accion text; -- 'CHECKIN' o 'CHECKOUT'
    v_ruta_semanal_id uuid;
    v_current_metadata jsonb;
    v_now timestamptz := now();
    v_todas_completadas boolean;
begin
    v_id := (p_datos->>'id')::uuid;
    v_tipo := p_datos->>'entidad_tipo';
    v_accion := p_datos->>'accion';

    if v_tipo = 'VISITA' then
        -- 1. Obtener metadata actual y ruta_id
        select ruta_semanal_id, metadata into v_ruta_semanal_id, v_current_metadata
        from public.ruta_semanal_visita
        where id = v_id;

        if not found then
            raise exception 'No se encontro la visita con ID %', v_id;
        end if;

        -- 2. Actualizar visita
        update public.ruta_semanal_visita
        set 
            estatus = case when v_accion = 'CHECKOUT' then 'COMPLETADA' else estatus end,
            selfie_url = coalesce(p_datos->>'selfie_url', selfie_url),
            evidencia_url = coalesce(p_datos->>'evidencia_url', evidencia_url),
            checklist_calidad = coalesce((p_datos->'checklist')::jsonb, checklist_calidad),
            comentarios = coalesce(p_datos->>'comments', comentarios),
            completada_en = case when v_accion = 'CHECKOUT' then v_now else completada_en end,
            metadata = coalesce(v_current_metadata, '{}'::jsonb) || (p_datos->'metadata_delta')::jsonb,
            updated_at = v_now
        where id = v_id;

        -- 3. Actualizar estado de la ruta semanal (padre)
        if v_accion = 'CHECKOUT' then
            -- Verificar si todas las visitas estan completadas
            select not exists (
                select 1 from public.ruta_semanal_visita 
                where ruta_semanal_id = v_ruta_semanal_id 
                  and estatus <> 'COMPLETADA'
            ) into v_todas_completadas;

            update public.ruta_semanal
            set 
                estatus = case when v_todas_completadas then 'CERRADA' else 'EN_PROGRESO' end,
                updated_at = v_now,
                updated_by_usuario_id = (p_datos->>'usuario_id')::uuid
            where id = v_ruta_semanal_id;
        else
            -- Check-in pone en progreso
            update public.ruta_semanal
            set 
                estatus = 'EN_PROGRESO',
                updated_at = v_now,
                updated_by_usuario_id = (p_datos->>'usuario_id')::uuid
            where id = v_ruta_semanal_id;
        end if;

    elsif v_tipo = 'EVENTO' then
        -- 1. Obtener metadata actual
        select metadata into v_current_metadata
        from public.ruta_agenda_evento
        where id = v_id;

        -- 2. Actualizar evento de agenda
        update public.ruta_agenda_evento
        set 
            estatus_ejecucion = case when v_accion = 'CHECKOUT' then 'COMPLETADO' else 'EN_CURSO' end,
            check_in_en = case when v_accion = 'CHECKIN' then v_now else check_in_en end,
            check_out_en = case when v_accion = 'CHECKOUT' then v_now else check_out_en end,
            selfie_url = coalesce(p_datos->>'selfie_url', selfie_url),
            evidencia_url = coalesce(p_datos->>'evidencia_url', evidencia_url),
            metadata = coalesce(v_current_metadata, '{}'::jsonb) || (p_datos->'metadata_delta')::jsonb,
            updated_at = v_now
        where id = v_id;
    end if;

    -- 3. Registrar Audit Log
    insert into public.audit_log (
        tabla, registro_id, accion, payload, cuenta_cliente_id, usuario_id
    ) values (
        case when v_tipo = 'VISITA' then 'ruta_semanal_visita' else 'ruta_agenda_evento' end,
        v_id,
        'EVENTO',
        jsonb_build_object(
            'evento', case when v_accion = 'CHECKIN' then 'ruta_visita_checkin' else 'ruta_visita_checkout' end,
            'source', 'rpc_registrar_accion_ruta_supervisor'
        ),
        (p_datos->>'cuenta_cliente_id')::uuid,
        (p_datos->>'usuario_id')::uuid
    );

    return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
