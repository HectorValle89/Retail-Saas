-- Permitir que el upsert de confirmación de lote infiera correctamente la clave de conflicto.
-- El índice parcial anterior no era utilizable por ON CONFLICT (lote_id, pdv_id) en PostgreSQL.

drop index if exists public.idx_material_distribucion_mensual_lote_pdv;

create unique index if not exists idx_material_distribucion_mensual_lote_pdv
on public.material_distribucion_mensual(lote_id, pdv_id);
