create or replace view public.material_distribucion_mensual_estado_resumen as
select
  distribucion.id as distribucion_id,
  coalesce(detalle.detalle_count, 0)::integer as detalle_count,
  coalesce(ultima_milla.ultima_milla_count, 0)::integer as ultima_milla_count
from public.material_distribucion_mensual as distribucion
left join (
  select distribucion_id, count(*) as detalle_count
  from public.material_distribucion_detalle
  group by distribucion_id
) as detalle on detalle.distribucion_id = distribucion.id
left join (
  select distribucion_id, count(*) as ultima_milla_count
  from public.material_entrega_ultima_milla
  group by distribucion_id
) as ultima_milla on ultima_milla.distribucion_id = distribucion.id;
