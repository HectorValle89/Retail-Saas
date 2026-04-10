alter table public.pdv
  drop constraint if exists pdv_estatus_check;

alter table public.pdv
  add constraint pdv_estatus_check
  check (estatus in ('ACTIVO', 'TEMPORAL', 'INACTIVO'));

create table if not exists public.pdv_cobertura_operativa (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id),
  pdv_id uuid not null references public.pdv(id),
  estado_operativo text not null default 'VACANTE'
    check (estado_operativo in ('CUBIERTO', 'RESERVADO_PENDIENTE_ACCESO', 'VACANTE')),
  motivo_operativo text null
    check (
      motivo_operativo is null or motivo_operativo in (
        'SIN_DC',
        'EN_PROCESO_FIRMA',
        'PENDIENTE_ACCESO',
        'PDV_DE_PASO',
        'TIENDA_ESCUELA',
        'MOVIMIENTO_TEMPORAL'
      )
    ),
  empleado_reservado_id uuid null references public.empleado(id),
  pdv_paso_id uuid null references public.pdv(id),
  acceso_pendiente_desde timestamptz null,
  proximo_recordatorio_at timestamptz null,
  apartado_por_usuario_id uuid null references public.usuario(id),
  observaciones text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cuenta_cliente_id, pdv_id)
);

create index if not exists idx_pdv_cobertura_operativa_cuenta_estado
  on public.pdv_cobertura_operativa(cuenta_cliente_id, estado_operativo);

create index if not exists idx_pdv_cobertura_operativa_empleado_reservado
  on public.pdv_cobertura_operativa(empleado_reservado_id);

create index if not exists idx_pdv_cobertura_operativa_recordatorio
  on public.pdv_cobertura_operativa(proximo_recordatorio_at);
