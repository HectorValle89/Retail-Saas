-- Optimización de Performance: Índices para Dashboard de Supervisores
-- Fecha: 2026-04-28

-- Índices en Venta para acelerar filtrado por tienda y fecha
create index if not exists idx_venta_pdv_fecha 
on public.venta(pdv_id, fecha_utc desc);

create index if not exists idx_venta_confirmada_fecha 
on public.venta(confirmada, fecha_utc desc)
where confirmada is false or confirmada is null;

-- Índices en Asistencia para acelerar filtrado por tienda y supervisor
create index if not exists idx_asistencia_pdv_fecha 
on public.asistencia(pdv_id, fecha_operacion desc);

-- Comentarios de negocio
comment on index public.idx_venta_pdv_fecha is 'Optimiza el filtrado de ventas por tienda y fecha para supervisores.';
comment on index public.idx_asistencia_pdv_fecha is 'Optimiza el filtrado de asistencias por tienda para reportes operativos.';
