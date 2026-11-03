-- Solo un administrador puede fijar o cambiar el precio base de un producto;
-- de lo contrario un operador podria saltear el control de precio de lista.
create or replace function public.assert_admin_for_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.sale_price <> 0 and not public.is_admin() then
      raise exception 'Solo un administrador puede fijar el precio de un producto';
    end if;
  elsif new.sale_price is distinct from old.sale_price and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el precio de un producto';
  end if;
  return new;
end;
$$;

revoke execute on function public.assert_admin_for_price_change() from public, anon, authenticated;

create trigger products_admin_price_change
before insert or update of sale_price on public.products
for each row execute procedure public.assert_admin_for_price_change();
