-- Función del trigger para descontar canjes del inventario de forma automática
create or replace function public.fn_captura_canje_auto_deduccion()
returns trigger as $$
declare
  isdin_cuenta_id uuid;
begin
  if new.tipo_registro = 'CANJE' and new.material_catalogo_id is not null and new.cantidad > 0 then
    -- Registrar el descuento de inventario de materiales
    insert into public.material_inventario_movimiento (
      cuenta_cliente_id,
      pdv_id,
      material_catalogo_id,
      empleado_id,
      tipo_movimiento,
      sentido,
      cantidad,
      cantidad_delta,
      motivo,
      observaciones,
      metadata
    ) values (
      new.cuenta_cliente_id,
      new.pdv_id,
      new.material_catalogo_id,
      new.empleado_id,
      'ENTREGA_CLIENTE',
      'SALIDA',
      new.cantidad,
      -new.cantidad, -- delta negativo
      'CANJE_PORTAL_PUBLICO',
      'Descuento automático por canje registrado desde el portal público sin credenciales.',
      jsonb_build_object(
        'captura_registro_id', new.id,
        'link_id', new.link_id,
        'origen_canal', 'SUBDOMINIO_DERMOCONSEJO'
      )
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger sobre la tabla captura_publica_registro
drop trigger if exists trg_captura_canje_auto_deduccion on public.captura_publica_registro;
create trigger trg_captura_canje_auto_deduccion
after insert on public.captura_publica_registro
for each row
execute function public.fn_captura_canje_auto_deduccion();
