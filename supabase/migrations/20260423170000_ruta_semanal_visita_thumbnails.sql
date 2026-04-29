-- [2026-04-23] Miniaturas canónicas en ruta_semanal_visita para reportes R2-first

alter table public.ruta_semanal_visita
  add column if not exists selfie_thumbnail_url text,
  add column if not exists selfie_thumbnail_hash text,
  add column if not exists evidencia_thumbnail_url text,
  add column if not exists evidencia_thumbnail_hash text;

create index if not exists idx_ruta_semanal_visita_selfie_thumbnail_hash
on public.ruta_semanal_visita(selfie_thumbnail_hash)
where selfie_thumbnail_hash is not null;

create index if not exists idx_ruta_semanal_visita_evidencia_thumbnail_hash
on public.ruta_semanal_visita(evidencia_thumbnail_hash)
where evidencia_thumbnail_hash is not null;

update public.ruta_semanal_visita as visita
set
  selfie_thumbnail_url = coalesce(
    visita.selfie_thumbnail_url,
    visita.metadata #>> '{checkOut,selfieThumbnailUrl}',
    visita.metadata #>> '{checkIn,selfieThumbnailUrl}'
  ),
  selfie_thumbnail_hash = coalesce(
    visita.selfie_thumbnail_hash,
    visita.metadata #>> '{checkOut,selfieThumbnailHash}',
    visita.metadata #>> '{checkIn,selfieThumbnailHash}'
  ),
  evidencia_thumbnail_url = coalesce(
    visita.evidencia_thumbnail_url,
    visita.metadata #>> '{checkOut,evidenciaThumbnailUrl}',
    visita.metadata #>> '{checkIn,evidenciaThumbnailUrl}'
  ),
  evidencia_thumbnail_hash = coalesce(
    visita.evidencia_thumbnail_hash,
    visita.metadata #>> '{checkOut,evidenciaThumbnailHash}',
    visita.metadata #>> '{checkIn,evidenciaThumbnailHash}'
  )
where
  visita.selfie_thumbnail_url is null
  or visita.selfie_thumbnail_hash is null
  or visita.evidencia_thumbnail_url is null
  or visita.evidencia_thumbnail_hash is null;

update public.ruta_semanal_visita as visita
set
  selfie_thumbnail_url = coalesce(visita.selfie_thumbnail_url, archivo_selfie.miniatura_ruta_archivo),
  selfie_thumbnail_hash = coalesce(visita.selfie_thumbnail_hash, archivo_selfie.miniatura_sha256)
from public.archivo_hash as archivo_selfie
where
  visita.selfie_hash is not null
  and archivo_selfie.sha256 = visita.selfie_hash
  and (visita.selfie_thumbnail_url is null or visita.selfie_thumbnail_hash is null);

update public.ruta_semanal_visita as visita
set
  evidencia_thumbnail_url = coalesce(visita.evidencia_thumbnail_url, archivo_evidencia.miniatura_ruta_archivo),
  evidencia_thumbnail_hash = coalesce(visita.evidencia_thumbnail_hash, archivo_evidencia.miniatura_sha256)
from public.archivo_hash as archivo_evidencia
where
  visita.evidencia_hash is not null
  and archivo_evidencia.sha256 = visita.evidencia_hash
  and (visita.evidencia_thumbnail_url is null or visita.evidencia_thumbnail_hash is null);

create or replace function public.rpc_registrar_accion_ruta_supervisor(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id uuid;
    v_tipo text;
    v_accion text;
    v_ruta_semanal_id uuid;
    v_current_metadata jsonb;
    v_now timestamptz := now();
    v_todas_completadas boolean;
begin
    v_id := (p_datos->>'id')::uuid;
    v_tipo := p_datos->>'entidad_tipo';
    v_accion := p_datos->>'accion';

    if v_tipo = 'VISITA' then
        select ruta_semanal_id, metadata into v_ruta_semanal_id, v_current_metadata
        from public.ruta_semanal_visita
        where id = v_id;

        if not found then
            raise exception 'No se encontro la visita con ID %', v_id;
        end if;

        update public.ruta_semanal_visita
        set
            estatus = case when v_accion = 'CHECKOUT' then 'COMPLETADA' else estatus end,
            selfie_url = coalesce(p_datos->>'selfie_url', selfie_url),
            selfie_thumbnail_url = coalesce(p_datos->>'selfie_thumbnail_url', selfie_thumbnail_url),
            evidencia_url = coalesce(p_datos->>'evidencia_url', evidencia_url),
            evidencia_thumbnail_url = coalesce(p_datos->>'evidencia_thumbnail_url', evidencia_thumbnail_url),
            checklist_calidad = coalesce((p_datos->'checklist')::jsonb, checklist_calidad),
            comentarios = coalesce(p_datos->>'comments', comentarios),
            completada_en = case when v_accion = 'CHECKOUT' then v_now else completada_en end,
            metadata = coalesce(v_current_metadata, '{}'::jsonb) || (p_datos->'metadata_delta')::jsonb,
            updated_at = v_now
        where id = v_id;

        if v_accion = 'CHECKOUT' then
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
            update public.ruta_semanal
            set
                estatus = 'EN_PROGRESO',
                updated_at = v_now,
                updated_by_usuario_id = (p_datos->>'usuario_id')::uuid
            where id = v_ruta_semanal_id;
        end if;

    elsif v_tipo = 'EVENTO' then
        select metadata into v_current_metadata
        from public.ruta_agenda_evento
        where id = v_id;

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
