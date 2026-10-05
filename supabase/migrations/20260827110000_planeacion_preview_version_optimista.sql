-- La confirmacion debe usar la misma version optimista observada por la vista previa.
-- El snapshot tiene una revision interna (inicia en 1) distinta de ui_change_version
-- (inicia en 0); por ello nunca debe usarse como token de escritura.

create or replace function public.previsualizar_planeacion_mensual_versionada(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_operaciones jsonb,
  p_alcance text default 'GENERAL'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_scope_key text;
  v_version_base bigint := 0;
  v_preview jsonb;
begin
  if p_alcance not in ('GENERAL', 'SUPERVISOR_PDVS') then
    raise exception 'PLANEACION_ALCANCE_PREVIEW_INVALIDO:%', p_alcance;
  end if;

  if p_alcance = 'SUPERVISOR_PDVS' then
    v_preview := public.previsualizar_planeacion_supervisor_pdvs(
      p_cuenta_cliente_id,
      v_mes,
      p_operaciones
    );
  else
    v_preview := public.previsualizar_planeacion_mensual(
      p_cuenta_cliente_id,
      v_mes,
      p_operaciones
    );
  end if;

  v_scope_key := p_cuenta_cliente_id::text || ':' || to_char(v_mes, 'YYYY-MM');

  select version
  into v_version_base
  from public.ui_change_version
  where module = 'asignaciones'
    and surface = 'planeacion_mensual'
    and scope_key = v_scope_key
    and role_target = 'ALL';

  return v_preview || jsonb_build_object(
    'versionBase', coalesce(v_version_base, 0)
  );
end;
$$;

revoke all on function public.previsualizar_planeacion_mensual_versionada(
  uuid, date, jsonb, text
) from public, anon, authenticated;

grant execute on function public.previsualizar_planeacion_mensual_versionada(
  uuid, date, jsonb, text
) to service_role;

comment on function public.previsualizar_planeacion_mensual_versionada(
  uuid, date, jsonb, text
) is
  'Vista previa en un round-trip con el token ui_change_version exacto que debe presentar la confirmacion.';
