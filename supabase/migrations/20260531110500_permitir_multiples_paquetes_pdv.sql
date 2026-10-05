-- Migración: Permitir múltiples paquetes por PDV en un mismo lote
-- Regla de español latino y UTF-8

drop index if exists public.idx_material_distribucion_mensual_lote_pdv;

create index if not exists idx_material_distribucion_mensual_lote_pdv
on public.material_distribucion_mensual(lote_id, pdv_id);

comment on index public.idx_material_distribucion_mensual_lote_pdv is 'Index no único para permitir múltiples paquetes por PDV en un mismo lote';
