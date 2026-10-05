begin;

-- El catálogo de septiembre ya contiene esta vigencia como activa. Solo se
-- corrige la etiqueta del PDV de Metepec para distinguirla de Guadalajara.
update public.pdv
set nombre = 'Sanborns Galerías Metepec',
    updated_at = now()
where id = '79200d1b-310a-4e20-a24f-4bb82bdfcf1e'::uuid
  and clave_btl = 'BTL-SAN-GALM-ME'
  and nombre = 'Sanborns Galerias Metepec';

update public.pdv_detalle_vigencia
set nombre = 'Sanborns Galerías Metepec',
    updated_at = now()
where pdv_id = '79200d1b-310a-4e20-a24f-4bb82bdfcf1e'::uuid
  and cuenta_cliente_id = '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'::uuid
  and vigente_desde = date '2026-09-01'
  and nombre = 'Sanborns Galerias Metepec';

insert into public.audit_log (tabla, registro_id, accion, payload, cuenta_cliente_id)
select
  'pdv',
  pdv.id,
  'UPDATE',
  jsonb_build_object(
    'motivo', 'CORRECCION_CAPTURA_PUBLICA_SEPTIEMBRE_2026',
    'clave_btl', pdv.clave_btl,
    'nombre_aplicado', 'Sanborns Galerías Metepec',
    'vigencia', '2026-09-01'
  ),
  '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'::uuid
from public.pdv pdv
where pdv.id = '79200d1b-310a-4e20-a24f-4bb82bdfcf1e'::uuid
  and pdv.clave_btl = 'BTL-SAN-GALM-ME';

commit;
