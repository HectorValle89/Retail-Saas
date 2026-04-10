alter table public.pdv_rotacion_maestra enable row level security;

drop policy if exists "pdv_rotacion_maestra_select_base" on public.pdv_rotacion_maestra;
create policy "pdv_rotacion_maestra_select_base"
on public.pdv_rotacion_maestra
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "pdv_rotacion_maestra_write_operacion" on public.pdv_rotacion_maestra;
create policy "pdv_rotacion_maestra_write_operacion"
on public.pdv_rotacion_maestra
for all
to authenticated
using (public.es_administrador())
with check (public.es_administrador());
