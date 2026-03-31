create index if not exists idx_asistencia_cuenta_fecha_created
  on public.asistencia(cuenta_cliente_id, fecha_operacion desc, created_at desc);

create index if not exists idx_asistencia_supervisor_fecha
  on public.asistencia(supervisor_empleado_id, fecha_operacion desc)
  where supervisor_empleado_id is not null;

create index if not exists idx_venta_cuenta_fecha_confirmada
  on public.venta(cuenta_cliente_id, fecha_utc desc, confirmada);

create index if not exists idx_love_cuenta_fecha_estatus
  on public.love_isdin(cuenta_cliente_id, fecha_utc desc, estatus);

create index if not exists idx_gasto_cuenta_fecha_estatus
  on public.gasto(cuenta_cliente_id, fecha_gasto desc, estatus);

create index if not exists idx_cuota_periodo_cuenta_estado
  on public.cuota_empleado_periodo(periodo_id, cuenta_cliente_id, estado);

create index if not exists idx_nomina_ledger_periodo_cuenta_created
  on public.nomina_ledger(periodo_id, cuenta_cliente_id, created_at desc);

create index if not exists idx_solicitud_empleado_rango_estatus
  on public.solicitud(empleado_id, fecha_inicio, fecha_fin, estatus);
