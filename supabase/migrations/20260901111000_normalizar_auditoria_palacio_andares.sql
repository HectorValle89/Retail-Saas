-- Normaliza la repetición administrativa provocada al validar una migración
-- transaccional que ya contenía COMMIT. No elimina ni mueve registros.

begin;

do $$
declare
  v_asignacion_id uuid := 'd0f270c7-c590-468a-a0ad-be14a268e2e8'::uuid;
  v_origen_pdv_id uuid := '1dbea0b1-ae5f-4082-b630-08afd043ccf5'::uuid;
  v_destino_pdv_id uuid := 'a1b94f6a-96b3-4c8e-8ec5-4609a5ee4222'::uuid;
  v_cuenta_id uuid := '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'::uuid;
begin
  update public.asignacion
  set observaciones = '[ROL SEP 2026] fila 176 · Corrección permanente desde 2026-09-01 a Palacio Andares',
      metadata = jsonb_set(
        jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{correccion_operativa,origen_pdv_id}',
          to_jsonb(v_origen_pdv_id::text),
          true
        ),
        '{correccion_operativa,destino_pdv_id}',
        to_jsonb(v_destino_pdv_id::text),
        true
      ),
      updated_at = timezone('utc', now())
  where id = v_asignacion_id
    and pdv_id = v_destino_pdv_id;

  insert into public.audit_log (
    tabla, registro_id, accion, payload, cuenta_cliente_id
  ) values (
    'asignacion', v_asignacion_id::text, 'EVENTO',
    jsonb_build_object(
      'tipo', 'NORMALIZACION_IDEMPOTENCIA_PALACIO_ANDARES',
      'motivo', 'La validación administrativa ejecutó una migración con COMMIT interno dos veces.',
      'origen_pdv_id', v_origen_pdv_id,
      'destino_pdv_id', v_destino_pdv_id,
      'registros_operativos_eliminados', 0,
      'registros_operativos_trasladados_en_esta_normalizacion', 0,
      'correccion', 'Se conserva el origen real y una sola observación visible.'
    ),
    v_cuenta_id
  );
end;
$$;

commit;
