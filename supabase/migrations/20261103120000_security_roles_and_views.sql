-- Roles (admin / operator), vistas con security_invoker, revokes y validaciones de precio y motivo.

create type public.app_role as enum ('admin', 'operator');

alter table public.profiles
  add column if not exists role public.app_role not null default 'operator';

-- El primer perfil que se crea queda como admin.
create or replace function public.assign_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    new.role := 'admin';
  end if;
  return new;
end;
$$;

create trigger profiles_assign_first_admin
before insert on public.profiles
for each row execute procedure public.assign_first_admin();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.require_operating_user();
begin
  if not public.is_admin() then
    raise exception 'Esta accion requiere rol administrador';
  end if;
  return v_user_id;
end;
$$;

-- Nadie puede cambiarse el rol: solo columnas no sensibles para authenticated.
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, email, full_name) on public.profiles to authenticated;
grant update (email, full_name) on public.profiles to authenticated;

-- Los nombres de perfil se leen entre usuarios (historial de movimientos).
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select authenticated" on public.profiles
for select to authenticated using (true);

-- Vistas con los permisos de quien consulta y sin acceso anonimo.
alter view public.product_inventory_overview set (security_invoker = true);
alter view public.supply_inventory_overview set (security_invoker = true);
alter view public.inventory_movement_details set (security_invoker = true);
revoke all on public.product_inventory_overview from anon;
revoke all on public.supply_inventory_overview from anon;
revoke all on public.inventory_movement_details from anon;

-- Funciones SECURITY DEFINER de perfiles: fuera del alcance de anon.
revoke execute on function public.sync_profile_from_auth_user_row() from public, anon, authenticated;
revoke execute on function public.assign_first_admin() from public, anon, authenticated;
revoke execute on function public.backfill_profiles_from_auth_users() from public, anon, authenticated;
revoke execute on function public.ensure_current_user_profile() from public, anon;
grant execute on function public.ensure_current_user_profile() to authenticated;
grant execute on function public.backfill_profiles_from_auth_users() to service_role;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.require_admin() from public, anon;

-- Operaciones sensibles: implementacion privada + envoltorio que exige admin y motivo.
alter function public.apply_stock_adjustment(jsonb) rename to apply_stock_adjustment_impl;
alter function public.reverse_sale_order(jsonb) rename to reverse_sale_order_impl;
alter function public.reverse_supply_purchase(jsonb) rename to reverse_supply_purchase_impl;
alter function public.reverse_production_batch(jsonb) rename to reverse_production_batch_impl;
alter function public.create_sale_order(jsonb) rename to create_sale_order_impl;

revoke execute on function public.apply_stock_adjustment_impl(jsonb) from public, anon, authenticated;
revoke execute on function public.reverse_sale_order_impl(jsonb) from public, anon, authenticated;
revoke execute on function public.reverse_supply_purchase_impl(jsonb) from public, anon, authenticated;
revoke execute on function public.reverse_production_batch_impl(jsonb) from public, anon, authenticated;
revoke execute on function public.create_sale_order_impl(jsonb) from public, anon, authenticated;

create or replace function public.apply_stock_adjustment(payload jsonb)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if nullif(trim(payload ->> 'notes'), '') is null then
    raise exception 'El motivo del ajuste es obligatorio';
  end if;
  return public.apply_stock_adjustment_impl(payload);
end;
$$;

create or replace function public.reverse_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if nullif(trim(payload ->> 'reason'), '') is null then
    raise exception 'El motivo de la anulacion es obligatorio';
  end if;
  return public.reverse_sale_order_impl(payload);
end;
$$;

create or replace function public.reverse_supply_purchase(payload jsonb)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if nullif(trim(payload ->> 'reason'), '') is null then
    raise exception 'El motivo de la anulacion es obligatorio';
  end if;
  return public.reverse_supply_purchase_impl(payload);
end;
$$;

create or replace function public.reverse_production_batch(payload jsonb)
returns public.production_batches
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if nullif(trim(payload ->> 'reason'), '') is null then
    raise exception 'El motivo de la anulacion es obligatorio';
  end if;
  return public.reverse_production_batch_impl(payload);
end;
$$;

-- Precio de venta: el operador vende a precio de lista; solo el admin puede cambiarlo.
create or replace function public.create_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_list_price numeric(14, 2);
begin
  perform public.require_operating_user();

  if payload is null or jsonb_typeof(payload -> 'items') <> 'array' then
    raise exception 'La venta debe incluir al menos un item';
  end if;

  if not public.is_admin() then
    for v_item in select * from jsonb_array_elements(payload -> 'items')
    loop
      select sale_price into v_list_price
      from public.products
      where id = (v_item ->> 'productId')::uuid;

      if v_list_price is null then
        raise exception 'Producto inexistente o inactivo';
      end if;

      if round((v_item ->> 'unitPrice')::numeric, 2) <> v_list_price then
        raise exception 'El precio unitario debe coincidir con el precio de lista; solo un administrador puede cambiarlo';
      end if;
    end loop;
  end if;

  return public.create_sale_order_impl(payload);
end;
$$;

revoke execute on function public.apply_stock_adjustment(jsonb) from public, anon;
revoke execute on function public.reverse_sale_order(jsonb) from public, anon;
revoke execute on function public.reverse_supply_purchase(jsonb) from public, anon;
revoke execute on function public.reverse_production_batch(jsonb) from public, anon;
revoke execute on function public.create_sale_order(jsonb) from public, anon;
grant execute on function public.apply_stock_adjustment(jsonb) to authenticated;
grant execute on function public.reverse_sale_order(jsonb) to authenticated;
grant execute on function public.reverse_supply_purchase(jsonb) to authenticated;
grant execute on function public.reverse_production_batch(jsonb) to authenticated;
grant execute on function public.create_sale_order(jsonb) to authenticated;
