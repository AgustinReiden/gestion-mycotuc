-- Catalogo: categorias, escalas de precio por cantidad y combos por componentes.

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.product_categories (name)
values ('Extractos'), ('Sales'), ('Hongos Frescos')
on conflict (name) do nothing;

-- Los productos solo pueden usar categorias activas del catalogo.
create or replace function public.assert_product_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.product_categories where name = new.category and is_active
  ) then
    raise exception 'La categoria % no existe o esta inactiva', new.category;
  end if;
  return new;
end;
$$;

create trigger products_assert_category
before insert or update of category on public.products
for each row execute procedure public.assert_product_category();

create table public.product_price_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  min_qty numeric(14, 2) not null check (min_qty > 0),
  unit_price numeric(14, 2) not null check (unit_price > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (product_id, min_qty)
);

create table public.product_bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sale_price numeric(14, 2) not null check (sale_price > 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index product_bundles_name_key on public.product_bundles (lower(name));

create table public.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.product_bundles (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14, 2) not null check (quantity > 0),
  unique (bundle_id, product_id)
);

create trigger handle_product_bundles_updated_at
before update on public.product_bundles
for each row execute procedure public.set_row_updated_at();

create index product_price_tiers_product_idx on public.product_price_tiers (product_id, min_qty desc);
create index product_bundle_items_bundle_idx on public.product_bundle_items (bundle_id);

alter table public.sales_order_items
  add column if not exists bundle_id uuid references public.product_bundles (id),
  add column if not exists list_price numeric(14, 2);

create index if not exists sales_order_items_order_idx on public.sales_order_items (sales_order_id);

alter table public.product_categories enable row level security;
alter table public.product_price_tiers enable row level security;
alter table public.product_bundles enable row level security;
alter table public.product_bundle_items enable row level security;

create policy "authenticated read product categories" on public.product_categories
for select to authenticated using (true);
create policy "authenticated read product price tiers" on public.product_price_tiers
for select to authenticated using (true);
create policy "authenticated read product bundles" on public.product_bundles
for select to authenticated using (true);
create policy "authenticated read product bundle items" on public.product_bundle_items
for select to authenticated using (true);

revoke insert, update, delete on public.product_categories, public.product_price_tiers,
  public.product_bundles, public.product_bundle_items from anon, authenticated;

-- Precio de lista de un producto para una cantidad: escala mas alta alcanzada, o precio base.
create or replace function public.resolve_product_price(p_product_id uuid, p_quantity numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select t.unit_price
      from public.product_price_tiers t
      where t.product_id = p_product_id
        and t.min_qty <= p_quantity
      order by t.min_qty desc
      limit 1
    ),
    (select p.sale_price from public.products p where p.id = p_product_id)
  );
$$;

create or replace function public.save_price_tiers(payload jsonb)
returns setof public.product_price_tiers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid := (payload ->> 'productId')::uuid;
  v_tier jsonb;
begin
  perform public.require_admin();

  if not exists (select 1 from public.products where id = v_product_id) then
    raise exception 'Producto inexistente';
  end if;

  if jsonb_typeof(payload -> 'tiers') <> 'array' then
    raise exception 'Las escalas deben ser una lista';
  end if;

  delete from public.product_price_tiers where product_id = v_product_id;

  for v_tier in select * from jsonb_array_elements(payload -> 'tiers')
  loop
    insert into public.product_price_tiers (product_id, min_qty, unit_price)
    values (v_product_id, (v_tier ->> 'minQty')::numeric, (v_tier ->> 'unitPrice')::numeric);
  end loop;

  return query
    select * from public.product_price_tiers where product_id = v_product_id order by min_qty;
end;
$$;

create or replace function public.upsert_bundle(payload jsonb)
returns public.product_bundles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bundle public.product_bundles;
  v_bundle_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_name text := nullif(trim(payload ->> 'name'), '');
  v_price numeric(14, 2) := (payload ->> 'salePrice')::numeric;
  v_item jsonb;
begin
  perform public.require_admin();

  if v_name is null or length(v_name) < 2 then
    raise exception 'El nombre del combo es obligatorio';
  end if;

  if v_price is null or v_price <= 0 then
    raise exception 'El precio del combo debe ser mayor a cero';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'El combo debe tener al menos un producto';
  end if;

  if v_bundle_id is not null then
    update public.product_bundles
    set
      name = v_name,
      sale_price = v_price,
      notes = nullif(trim(payload ->> 'notes'), ''),
      is_active = coalesce((payload ->> 'isActive')::boolean, true)
    where id = v_bundle_id
    returning * into v_bundle;

    if v_bundle.id is null then
      raise exception 'Combo inexistente';
    end if;

    delete from public.product_bundle_items where bundle_id = v_bundle_id;
  else
    insert into public.product_bundles (name, sale_price, notes, is_active)
    values (
      v_name,
      v_price,
      nullif(trim(payload ->> 'notes'), ''),
      coalesce((payload ->> 'isActive')::boolean, true)
    )
    returning * into v_bundle;
  end if;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    if not exists (select 1 from public.products where id = (v_item ->> 'productId')::uuid) then
      raise exception 'Producto del combo inexistente';
    end if;

    insert into public.product_bundle_items (bundle_id, product_id, quantity)
    values (v_bundle.id, (v_item ->> 'productId')::uuid, (v_item ->> 'quantity')::numeric);
  end loop;

  return v_bundle;
end;
$$;

-- Venta con escalas y combos. Reemplaza al envoltorio anterior y a su implementacion.
drop function if exists public.create_sale_order(jsonb);
drop function if exists public.create_sale_order_impl(jsonb);

create or replace function public.create_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders;
  v_item jsonb;
  v_need record;
  v_comp record;
  v_order_id uuid := gen_random_uuid();
  v_created_by uuid := public.require_operating_user();
  v_is_admin boolean := public.is_admin();
  v_sale_date date := coalesce(nullif(payload ->> 'saleDate', '')::date, current_date);
  v_payment_status public.payment_status := coalesce(
    nullif(payload ->> 'paymentStatus', '')::public.payment_status,
    'pending'
  );
  v_payment_method text := nullif(trim(payload ->> 'paymentMethod'), '');
  v_paid_at date := nullif(payload ->> 'paidAt', '')::date;
  v_notes text := nullif(trim(payload ->> 'notes'), '');
  v_total numeric(14, 2) := 0;
  v_product_id uuid;
  v_bundle_id uuid;
  v_bundle public.product_bundles;
  v_qty numeric(14, 2);
  v_tier_qty numeric(14, 2);
  v_expected numeric(14, 2);
  v_unit_price numeric(14, 2);
  v_line_total numeric(14, 2);
  v_bundle_total numeric(14, 2);
  v_weight_sum numeric;
  v_remaining numeric(14, 2);
  v_alloc numeric(14, 2);
  v_idx integer;
  v_count integer;
  v_product_name text;
begin
  if payload is null then
    raise exception 'Payload requerido';
  end if;

  perform public.assert_payment_consistency(v_payment_status, v_payment_method, v_paid_at);

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'La venta debe incluir al menos un item';
  end if;

  if not exists (
    select 1 from public.contacts
    where id = (payload ->> 'contactId')::uuid and type = 'client' and is_active
  ) then
    raise exception 'Cliente inexistente o inactivo';
  end if;

  if not exists (
    select 1 from public.sales_channels
    where id = (payload ->> 'channelId')::uuid and is_active
  ) then
    raise exception 'Canal de venta inexistente o inactivo';
  end if;

  -- Bloqueo de todos los productos involucrados (directos y componentes de combos).
  perform 1
  from public.products p
  where p.id in (
    select (i ->> 'productId')::uuid
    from jsonb_array_elements(payload -> 'items') i
    where nullif(i ->> 'productId', '') is not null
    union
    select bi.product_id
    from jsonb_array_elements(payload -> 'items') i
    join public.product_bundle_items bi on bi.bundle_id = nullif(i ->> 'bundleId', '')::uuid
  )
  order by p.id
  for update;

  -- Stock total requerido por producto, sumando lineas directas y componentes de combos.
  for v_need in
    select e.product_id, sum(e.qty) as qty
    from (
      select (i ->> 'productId')::uuid as product_id, (i ->> 'quantity')::numeric as qty
      from jsonb_array_elements(payload -> 'items') i
      where nullif(i ->> 'productId', '') is not null
      union all
      select bi.product_id, bi.quantity * (i ->> 'quantity')::numeric
      from jsonb_array_elements(payload -> 'items') i
      join public.product_bundle_items bi on bi.bundle_id = nullif(i ->> 'bundleId', '')::uuid
    ) e
    group by e.product_id
  loop
    select name into v_product_name
    from public.products where id = v_need.product_id and is_active;

    if v_product_name is null then
      raise exception 'Producto inexistente o inactivo';
    end if;

    if public.current_inventory_stock('product', v_need.product_id) < v_need.qty then
      raise exception 'Stock insuficiente para %', v_product_name;
    end if;
  end loop;

  insert into public.sales_orders (
    id, contact_id, channel_id, sale_date, payment_status, payment_method, paid_at, notes, created_by
  )
  values (
    v_order_id,
    (payload ->> 'contactId')::uuid,
    (payload ->> 'channelId')::uuid,
    v_sale_date,
    v_payment_status,
    v_payment_method,
    v_paid_at,
    v_notes,
    v_created_by
  );

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    v_qty := (v_item ->> 'quantity')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'La cantidad debe ser mayor a cero';
    end if;

    if nullif(v_item ->> 'productId', '') is not null and nullif(v_item ->> 'bundleId', '') is not null then
      raise exception 'Cada linea es un producto o un combo, no ambos';
    end if;

    if nullif(v_item ->> 'bundleId', '') is not null then
      -- Linea de combo: precio propio repartido entre los componentes.
      v_bundle_id := (v_item ->> 'bundleId')::uuid;

      select * into v_bundle from public.product_bundles where id = v_bundle_id and is_active;

      if v_bundle.id is null then
        raise exception 'Combo inexistente o inactivo';
      end if;

      v_expected := v_bundle.sale_price;
      v_unit_price := coalesce(nullif(v_item ->> 'unitPrice', '')::numeric, v_expected);

      if v_unit_price <= 0 then
        raise exception 'El precio del combo debe ser mayor a cero';
      end if;

      if not v_is_admin and round(v_unit_price, 2) <> v_expected then
        raise exception 'El precio del combo debe coincidir con el precio de lista; solo un administrador puede cambiarlo';
      end if;

      v_bundle_total := round(v_unit_price * v_qty, 2);

      select
        coalesce(sum(p.sale_price * bi.quantity * v_qty), 0),
        count(*)
      into v_weight_sum, v_count
      from public.product_bundle_items bi
      join public.products p on p.id = bi.product_id
      where bi.bundle_id = v_bundle_id;

      if v_count = 0 then
        raise exception 'El combo no tiene productos';
      end if;

      v_remaining := v_bundle_total;
      v_idx := 0;

      for v_comp in
        select
          bi.product_id,
          bi.quantity * v_qty as comp_qty,
          p.sale_price
        from public.product_bundle_items bi
        join public.products p on p.id = bi.product_id
        where bi.bundle_id = v_bundle_id
        order by bi.product_id
      loop
        v_idx := v_idx + 1;

        if v_idx = v_count then
          v_alloc := v_remaining;
        elsif v_weight_sum > 0 then
          v_alloc := round(v_bundle_total * (v_comp.sale_price * v_comp.comp_qty) / v_weight_sum, 2);
        else
          v_alloc := round(v_bundle_total / v_count, 2);
        end if;

        v_remaining := v_remaining - v_alloc;

        insert into public.sales_order_items (
          sales_order_id, product_id, quantity, unit_price, line_total, bundle_id, list_price
        )
        values (
          v_order_id,
          v_comp.product_id,
          v_comp.comp_qty,
          greatest(round(v_alloc / v_comp.comp_qty, 2), 0.01),
          v_alloc,
          v_bundle_id,
          v_comp.sale_price
        );

        insert into public.inventory_movements (
          entity_type, entity_id, movement_type, quantity, movement_date,
          reference_type, reference_id, notes, created_by
        )
        values (
          'product', v_comp.product_id, 'sale_out', round(v_comp.comp_qty * -1, 2),
          v_sale_date::timestamp, 'sale_order', v_order_id, v_notes, v_created_by
        );
      end loop;

      v_total := v_total + v_bundle_total;
    else
      -- Linea de producto: escala segun la cantidad total de ese producto en la venta.
      v_product_id := (v_item ->> 'productId')::uuid;

      select coalesce(sum((i ->> 'quantity')::numeric), 0)
      into v_tier_qty
      from jsonb_array_elements(payload -> 'items') i
      where i ->> 'productId' = v_product_id::text;

      v_expected := public.resolve_product_price(v_product_id, v_tier_qty);
      v_unit_price := coalesce(nullif(v_item ->> 'unitPrice', '')::numeric, v_expected);

      if v_unit_price <= 0 then
        raise exception 'El precio unitario debe ser mayor a cero';
      end if;

      if not v_is_admin and round(v_unit_price, 2) <> v_expected then
        raise exception 'El precio unitario debe coincidir con el precio de lista; solo un administrador puede cambiarlo';
      end if;

      v_line_total := round(v_qty * v_unit_price, 2);

      insert into public.sales_order_items (
        sales_order_id, product_id, quantity, unit_price, line_total, list_price
      )
      values (v_order_id, v_product_id, v_qty, v_unit_price, v_line_total, v_expected);

      insert into public.inventory_movements (
        entity_type, entity_id, movement_type, quantity, movement_date,
        reference_type, reference_id, notes, created_by
      )
      values (
        'product', v_product_id, 'sale_out', round(v_qty * -1, 2),
        v_sale_date::timestamp, 'sale_order', v_order_id, v_notes, v_created_by
      );

      v_total := v_total + v_line_total;
    end if;
  end loop;

  update public.sales_orders
  set subtotal_amount = v_total, total_amount = v_total
  where id = v_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.resolve_product_price(uuid, numeric) from public, anon;
revoke execute on function public.save_price_tiers(jsonb) from public, anon;
revoke execute on function public.upsert_bundle(jsonb) from public, anon;
revoke execute on function public.create_sale_order(jsonb) from public, anon;
grant execute on function public.resolve_product_price(uuid, numeric) to authenticated;
grant execute on function public.save_price_tiers(jsonb) to authenticated;
grant execute on function public.upsert_bundle(jsonb) to authenticated;
grant execute on function public.create_sale_order(jsonb) to authenticated;
