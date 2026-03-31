create table if not exists public.ruta_agenda_evento (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  ruta_semanal_id uuid not null references public.ruta_semanal(id) on delete cascade,
  ruta_semanal_visita_id uuid references public.ruta_semanal_visita(id) on delete set null,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid references public.pdv(id) on delete set null,
  fecha_operacion date not null,
  tipo_evento text not null check (
    tipo_evento in (
      'VISITA_ADICIONAL',
      'OFICINA',
      'FIRMA_CONTRATO',
      'FORMACION',
      'ENTREGA_NUEVA_DC',
      'PRESENTACION_GERENTE',
      'VISITA_EMERGENCIA',
      'OTRO'
    )
  ),
  modo_impacto text not null default 'SUMA' check (
    modo_impacto in ('SUMA', 'SOBREPONE_PARCIAL', 'REEMPLAZA_TOTAL')
  ),
  estatus_aprobacion text not null default 'NO_REQUIERE' check (
    estatus_aprobacion in ('NO_REQUIERE', 'PENDIENTE_COORDINACION', 'APROBADO', 'RECHAZADO')
  ),
  estatus_ejecucion text not null default 'PENDIENTE' check (
    estatus_ejecucion in ('PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'CANCELADO')
  ),
  titulo text not null,
  descripcion text,
  sede text,
  hora_inicio time,
  hora_fin time,
  selfie_url text,
  selfie_hash text,
  evidencia_url text,
  evidencia_hash text,
  check_in_en timestamptz,
  check_out_en timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  resolved_by_usuario_id uuid references public.usuario(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ruta_agenda_evento_supervisor_fecha
on public.ruta_agenda_evento(supervisor_empleado_id, fecha_operacion desc);

create index if not exists idx_ruta_agenda_evento_ruta_fecha
on public.ruta_agenda_evento(ruta_semanal_id, fecha_operacion desc);

create index if not exists idx_ruta_agenda_evento_aprobacion
on public.ruta_agenda_evento(estatus_aprobacion, fecha_operacion desc);

create trigger trg_ruta_agenda_evento_updated_at
before update on public.ruta_agenda_evento
for each row execute function public.actualizar_updated_at();

create table if not exists public.ruta_visita_pendiente_reposicion (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  ruta_semanal_id uuid not null references public.ruta_semanal(id) on delete cascade,
  ruta_semanal_visita_id uuid not null references public.ruta_semanal_visita(id) on delete cascade,
  agenda_evento_id uuid references public.ruta_agenda_evento(id) on delete set null,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  fecha_origen date not null,
  semana_sugerida_inicio date,
  clasificacion text not null check (clasificacion in ('JUSTIFICADA', 'INJUSTIFICADA')),
  motivo text not null,
  estado text not null default 'PENDIENTE' check (
    estado in ('PENDIENTE', 'REPROGRAMADA', 'DESCARTADA', 'EJECUTADA')
  ),
  ruta_destino_id uuid references public.ruta_semanal(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ruta_semanal_visita_id, clasificacion)
);

create index if not exists idx_ruta_reposicion_supervisor_estado
on public.ruta_visita_pendiente_reposicion(supervisor_empleado_id, estado, fecha_origen desc);

create index if not exists idx_ruta_reposicion_semana_sugerida
on public.ruta_visita_pendiente_reposicion(semana_sugerida_inicio, estado);

create trigger trg_ruta_visita_pendiente_reposicion_updated_at
before update on public.ruta_visita_pendiente_reposicion
for each row execute function public.actualizar_updated_at();

alter table public.ruta_agenda_evento enable row level security;
alter table public.ruta_visita_pendiente_reposicion enable row level security;

create policy "ruta_agenda_evento_select_operacion"
on public.ruta_agenda_evento
for select
to authenticated
using (
  public.es_usuario_interno()
  and (
    public.es_administrador()
    or supervisor_empleado_id = public.get_my_empleado_id()
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "ruta_agenda_evento_insert_supervisor"
on public.ruta_agenda_evento
for insert
to authenticated
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

create policy "ruta_agenda_evento_update_supervisor"
on public.ruta_agenda_evento
for update
to authenticated
using (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

create policy "ruta_reposicion_select_operacion"
on public.ruta_visita_pendiente_reposicion
for select
to authenticated
using (
  public.es_usuario_interno()
  and (
    public.es_administrador()
    or supervisor_empleado_id = public.get_my_empleado_id()
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "ruta_reposicion_insert_supervisor"
on public.ruta_visita_pendiente_reposicion
for insert
to authenticated
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

create policy "ruta_reposicion_update_supervisor"
on public.ruta_visita_pendiente_reposicion
for update
to authenticated
using (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

drop trigger if exists trg_ruta_agenda_evento_audit_log on public.ruta_agenda_evento;
create trigger trg_ruta_agenda_evento_audit_log
after insert or update or delete on public.ruta_agenda_evento
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_ruta_visita_pendiente_reposicion_audit_log on public.ruta_visita_pendiente_reposicion;
create trigger trg_ruta_visita_pendiente_reposicion_audit_log
after insert or update or delete on public.ruta_visita_pendiente_reposicion
for each row execute function public.audit_log_capture_row_change();
