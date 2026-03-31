-- =====================================================
-- Fase 7 - Endurecimiento de auditoria critica
-- Objetivo:
--   registrar cambios INSERT/UPDATE/DELETE de tablas
--   operativas y administrativas en audit_log sin perder
--   el contrato append-only ni el hash SHA-256.
-- =====================================================

create or replace function public.audit_log_capture_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  row_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  row_snapshot jsonb := coalesce(row_after, row_before, '{}'::jsonb);
  resolved_registro_id text := nullif(row_snapshot ->> 'id', '');
  resolved_cuenta_cliente_id uuid := nullif(row_snapshot ->> 'cuenta_cliente_id', '')::uuid;
  resolved_usuario_id uuid;
begin
  select u.id
    into resolved_usuario_id
  from public.usuario u
  where u.auth_user_id = auth.uid()
  limit 1;

  insert into public.audit_log (
    tabla,
    registro_id,
    accion,
    payload,
    usuario_id,
    cuenta_cliente_id
  ) values (
    tg_table_name,
    resolved_registro_id,
    tg_op,
    jsonb_strip_nulls(
      jsonb_build_object(
        'before', row_before,
        'after', row_after
      )
    ),
    resolved_usuario_id,
    resolved_cuenta_cliente_id
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_empleado_audit_log on public.empleado;
create trigger trg_empleado_audit_log
after insert or update or delete on public.empleado
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_usuario_audit_log on public.usuario;
create trigger trg_usuario_audit_log
after insert or update or delete on public.usuario
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_pdv_audit_log on public.pdv;
create trigger trg_pdv_audit_log
after insert or update or delete on public.pdv
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_asignacion_audit_log on public.asignacion;
create trigger trg_asignacion_audit_log
after insert or update or delete on public.asignacion
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_ruta_semanal_audit_log on public.ruta_semanal;
create trigger trg_ruta_semanal_audit_log
after insert or update or delete on public.ruta_semanal
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_ruta_semanal_visita_audit_log on public.ruta_semanal_visita;
create trigger trg_ruta_semanal_visita_audit_log
after insert or update or delete on public.ruta_semanal_visita
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_campana_audit_log on public.campana;
create trigger trg_campana_audit_log
after insert or update or delete on public.campana
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_campana_pdv_audit_log on public.campana_pdv;
create trigger trg_campana_pdv_audit_log
after insert or update or delete on public.campana_pdv
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_formacion_evento_audit_log on public.formacion_evento;
create trigger trg_formacion_evento_audit_log
after insert or update or delete on public.formacion_evento
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_formacion_asistencia_audit_log on public.formacion_asistencia;
create trigger trg_formacion_asistencia_audit_log
after insert or update or delete on public.formacion_asistencia
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_asistencia_audit_log on public.asistencia;
create trigger trg_asistencia_audit_log
after insert or update or delete on public.asistencia
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_venta_audit_log on public.venta;
create trigger trg_venta_audit_log
after insert or update or delete on public.venta
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_love_isdin_audit_log on public.love_isdin;
create trigger trg_love_isdin_audit_log
after insert or update or delete on public.love_isdin
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_solicitud_audit_log on public.solicitud;
create trigger trg_solicitud_audit_log
after insert or update or delete on public.solicitud
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_gasto_audit_log on public.gasto;
create trigger trg_gasto_audit_log
after insert or update or delete on public.gasto
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_entrega_material_audit_log on public.entrega_material;
create trigger trg_entrega_material_audit_log
after insert or update or delete on public.entrega_material
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_nomina_periodo_audit_log on public.nomina_periodo;
create trigger trg_nomina_periodo_audit_log
after insert or update or delete on public.nomina_periodo
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_cuota_empleado_periodo_audit_log on public.cuota_empleado_periodo;
create trigger trg_cuota_empleado_periodo_audit_log
after insert or update or delete on public.cuota_empleado_periodo
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_nomina_ledger_audit_log on public.nomina_ledger;
create trigger trg_nomina_ledger_audit_log
after insert or update or delete on public.nomina_ledger
for each row execute function public.audit_log_capture_row_change();