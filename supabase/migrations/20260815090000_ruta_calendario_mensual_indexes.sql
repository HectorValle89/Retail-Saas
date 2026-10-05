-- Índices para la matriz mensual de rutas y su detalle lazy por día.
-- La lectura se acota primero por semana de la ruta y después por supervisor/fecha.

create index if not exists idx_ruta_semanal_semana_supervisor_cuenta
on public.ruta_semanal(semana_inicio, supervisor_empleado_id, cuenta_cliente_id);

create index if not exists idx_ruta_reposicion_ruta_fecha
on public.ruta_visita_pendiente_reposicion(ruta_semanal_id, fecha_origen desc);
