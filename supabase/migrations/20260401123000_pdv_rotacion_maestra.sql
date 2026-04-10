create table if not exists public.pdv_rotacion_maestra (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id),
  pdv_id uuid not null references public.pdv(id),
  clasificacion_maestra text not null
    check (clasificacion_maestra in ('FIJO', 'ROTATIVO')),
  grupo_rotacion_codigo text null,
  grupo_tamano smallint null
    check (grupo_tamano is null or grupo_tamano in (2, 3)),
  slot_rotacion text null
    check (slot_rotacion is null or slot_rotacion in ('A', 'B', 'C')),
  fuente text not null default 'IMPORTADA'
    check (fuente in ('SUGERIDA', 'IMPORTADA')),
  vigente boolean not null default true,
  observaciones text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pdv_rotacion_maestra_rotativo_completo_check check (
    (
      clasificacion_maestra = 'FIJO'
      and grupo_rotacion_codigo is null
      and grupo_tamano is null
      and slot_rotacion is null
    )
    or (
      clasificacion_maestra = 'ROTATIVO'
      and grupo_rotacion_codigo is not null
      and grupo_tamano is not null
      and slot_rotacion is not null
    )
  )
);

create unique index if not exists uq_pdv_rotacion_maestra_pdv_vigente
  on public.pdv_rotacion_maestra(pdv_id)
  where vigente = true;

create index if not exists idx_pdv_rotacion_maestra_cuenta_vigente
  on public.pdv_rotacion_maestra(cuenta_cliente_id, vigente);

create index if not exists idx_pdv_rotacion_maestra_cuenta_grupo
  on public.pdv_rotacion_maestra(cuenta_cliente_id, grupo_rotacion_codigo);

create index if not exists idx_pdv_rotacion_maestra_clasificacion
  on public.pdv_rotacion_maestra(cuenta_cliente_id, clasificacion_maestra, vigente);
