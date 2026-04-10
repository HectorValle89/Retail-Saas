alter table public.asignacion enable row level security;

drop policy if exists "asignacion_delete_admin" on public.asignacion;
create policy "asignacion_delete_admin"
on public.asignacion
for delete
to authenticated
using (public.es_administrador());