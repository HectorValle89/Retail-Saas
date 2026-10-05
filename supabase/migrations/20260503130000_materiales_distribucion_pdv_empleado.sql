-- La dispersion mensual de materiales se planea por tienda/PDV.
-- El receptor se selecciona en la entrega de ultima milla.

drop index if exists public.idx_material_distribucion_mensual_lote_pdv_dc;
drop index if exists public.idx_material_distribucion_mensual_lote_pdv_dc_lookup;

create unique index if not exists idx_material_distribucion_mensual_lote_pdv
on public.material_distribucion_mensual(lote_id, pdv_id)
where lote_id is not null;

create index if not exists idx_material_distribucion_mensual_lote_pdv_lookup
on public.material_distribucion_mensual(lote_id, pdv_id, mes_operacion desc);
