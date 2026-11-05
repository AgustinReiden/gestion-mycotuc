-- Escalas de precio por cantidad por categoria.
-- Una escala por categoria: escalones "desde N unidades" con un precio total del pack o por unidad,
-- aplicados a la suma de unidades de los productos incluidos de esa categoria en una venta.

create table public.category_price_scales (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null unique references public.product_categories (id),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.category_price_scale_tiers (
  id uuid primary key default gen_random_uuid(),
  scale_id uuid not null references public.category_price_scales (id) on delete cascade,
  min_qty numeric(14, 2) not null check (min_qty > 0),
  price numeric(14, 2) not null check (price > 0),
  mode text not null check (mode in ('unit', 'pack')),
  unique (scale_id, min_qty)
);

create table public.category_price_scale_excluded_products (
  scale_id uuid not null references public.category_price_scales (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (scale_id, product_id)
);

create trigger handle_category_price_scales_updated_at
before update on public.category_price_scales
for each row execute procedure public.set_row_updated_at();

alter table public.sales_order_items
  add column if not exists price_scale_id uuid references public.category_price_scales (id),
  add column if not exists price_scale_min_qty numeric(14, 2);

-- Lectura por columna para authenticated (misma regla que las demas columnas de sales_order_items).
grant select (price_scale_id, price_scale_min_qty) on public.sales_order_items to authenticated;

alter table public.category_price_scales enable row level security;
alter table public.category_price_scale_tiers enable row level security;
alter table public.category_price_scale_excluded_products enable row level security;

create policy "authenticated read category price scales" on public.category_price_scales
for select to authenticated using (true);
create policy "authenticated read category price scale tiers" on public.category_price_scale_tiers
for select to authenticated using (true);
create policy "authenticated read category price scale exclusions" on public.category_price_scale_excluded_products
for select to authenticated using (true);

revoke insert, update, delete on public.category_price_scales, public.category_price_scale_tiers,
  public.category_price_scale_excluded_products from anon, authenticated;

-- Crea o edita la escala de una categoria (una por categoria) con sus escalones y exclusiones.
create or replace function public.save_category_price_scale(payload jsonb)
returns public.category_price_scales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scale public.category_price_scales;
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_category_id uuid := (payload ->> 'categoryId')::uuid;
  v_category_name text;
  v_active boolean := coalesce((payload ->> 'isActive')::boolean, true);
  v_tier jsonb;
  v_min numeric;
  v_price numeric;
  v_mode text;
begin
  perform public.require_admin();

  select name into v_category_name from public.product_categories where id = v_category_id;

  if v_category_name is null then
    raise exception 'Categoria inexistente';
  end if;

  if jsonb_typeof(payload -> 'tiers') <> 'array' or jsonb_array_length(payload -> 'tiers') = 0 then
    raise exception 'La escala debe tener al menos un escalon';
  end if;

  if v_id is not null and not exists (
    select 1 from public.category_price_scales where id = v_id and category_id = v_category_id
  ) then
    raise exception 'La escala no corresponde a esa categoria';
  end if;

  for v_tier in select * from jsonb_array_elements(payload -> 'tiers')
  loop
    v_min := (v_tier ->> 'minQty')::numeric;
    v_price := (v_tier ->> 'price')::numeric;
    v_mode := v_tier ->> 'mode';

    if v_min is null or v_min <= 0 then
      raise exception 'La cantidad de cada escalon debe ser mayor a cero';
    end if;

    if v_price is null or v_price <= 0 then
      raise exception 'El precio de cada escalon debe ser mayor a cero';
    end if;

    if v_mode is null or v_mode not in ('unit', 'pack') then
      raise exception 'El modo de cada escalon debe ser por unidad o total del pack';
    end if;
  end loop;

  if (
    select count(distinct (t ->> 'minQty')::numeric) <> count(*)
    from jsonb_array_elements(payload -> 'tiers') t
  ) then
    raise exception 'Hay escalones con la misma cantidad';
  end if;

  insert into public.category_price_scales (category_id, is_active)
  values (v_category_id, v_active)
  on conflict (category_id) do update set is_active = excluded.is_active
  returning * into v_scale;

  delete from public.category_price_scale_tiers where scale_id = v_scale.id;
  delete from public.category_price_scale_excluded_products where scale_id = v_scale.id;

  insert into public.category_price_scale_tiers (scale_id, min_qty, price, mode)
  select v_scale.id, (t ->> 'minQty')::numeric, (t ->> 'price')::numeric, t ->> 'mode'
  from jsonb_array_elements(payload -> 'tiers') t;

  -- Solo se guardan exclusiones de productos que siguen siendo de la categoria; las demas
  -- (por ejemplo un producto que cambio de categoria) se descartan sin error.
  insert into public.category_price_scale_excluded_products (scale_id, product_id)
  select distinct v_scale.id, p.id
  from jsonb_array_elements(coalesce(payload -> 'excludedProductIds', '[]'::jsonb)) e
  join public.products p on p.id = (e #>> '{}')::uuid and p.category = v_category_name;

  return v_scale;
end;
$$;

-- Total por renglon de los renglones de producto directo afectados por una escala activa.
-- p_items: [{ productId, quantity, bundleId? }]; item_index es 0-based sobre p_items.
-- Regla: q = unidades incluidas de la categoria; escalon = el de mayor min_qty <= q.
--   unit: cada unidad al precio del escalon.
--   pack: las min_qty unidades de mayor precio normal (desempate por producto y posicion)
--         se cobran en total al precio del escalon, repartido proporcional al precio normal;
--         el resto, a su precio normal.
create or replace function public.price_category_scales(p_items jsonb)
returns table (item_index integer, line_total numeric, scale_id uuid, tier_min_qty numeric)
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select
      (o.idx - 1)::integer as item_index,
      (o.item ->> 'productId')::uuid as product_id,
      (o.item ->> 'quantity')::numeric as qty
    from jsonb_array_elements(p_items) with ordinality as o(item, idx)
    where nullif(o.item ->> 'productId', '') is not null
      and nullif(o.item ->> 'bundleId', '') is null
      and (o.item ->> 'quantity')::numeric > 0
  ),
  elig as (
    select l.item_index, l.product_id, l.qty, p.sale_price, s.id as scale_id
    from lines l
    join public.products p on p.id = l.product_id
    join public.product_categories c on c.name = p.category and c.is_active
    join public.category_price_scales s on s.category_id = c.id and s.is_active
    where not exists (
      select 1 from public.category_price_scale_excluded_products x
      where x.scale_id = s.id and x.product_id = l.product_id
    )
  ),
  totals as (
    select e.scale_id, sum(e.qty) as q from elig e group by e.scale_id
  ),
  chosen as (
    select t.scale_id, tr.min_qty, tr.price, tr.mode
    from totals t
    join lateral (
      select x.min_qty, x.price, x.mode
      from public.category_price_scale_tiers x
      where x.scale_id = t.scale_id and x.min_qty <= t.q
      order by x.min_qty desc
      limit 1
    ) tr on true
  ),
  ordered as (
    select
      e.item_index, e.product_id, e.qty, e.sale_price, e.scale_id,
      c.min_qty, c.price, c.mode,
      coalesce(
        sum(e.qty) over (
          partition by e.scale_id
          order by e.sale_price desc, e.product_id, e.item_index
          rows between unbounded preceding and 1 preceding
        ), 0
      ) as before_qty
    from elig e
    join chosen c on c.scale_id = e.scale_id
  ),
  split as (
    select
      o.*,
      case
        when o.mode = 'unit' then o.qty
        else greatest(least(o.qty, o.min_qty - o.before_qty), 0)
      end as pack_qty
    from ordered o
  ),
  weighted as (
    select
      s.*,
      s.sale_price * s.pack_qty as w,
      sum(s.sale_price * s.pack_qty) over (partition by s.scale_id) as sum_w,
      sum(s.pack_qty) over (partition by s.scale_id) as sum_pack,
      row_number() over (
        partition by s.scale_id, (s.pack_qty > 0)
        order by s.sale_price asc, s.product_id desc, s.item_index desc
      ) as rev_rank
    from split s
  ),
  alloc as (
    select
      w.*,
      (w.pack_qty > 0 and w.rev_rank = 1) as is_last_pack,
      case
        when w.mode = 'unit' then round(w.qty * w.price, 2)
        when w.pack_qty = 0 then 0
        when w.sum_w > 0 then round(w.price * w.w / w.sum_w, 2)
        else round(w.price * w.pack_qty / w.sum_pack, 2)
      end as rounded_alloc
    from weighted w
  ),
  final as (
    select
      a.*,
      sum(case when not a.is_last_pack then a.rounded_alloc else 0 end)
        over (partition by a.scale_id) as others_sum
    from alloc a
  )
  select
    f.item_index,
    case
      when f.mode = 'unit' then f.rounded_alloc
      else
        (case when f.is_last_pack then f.price - f.others_sum else f.rounded_alloc end)
        + round((f.qty - f.pack_qty) * f.sale_price, 2)
    end as line_total,
    f.scale_id,
    f.min_qty as tier_min_qty
  from final f
  order by f.item_index;
$$;

revoke execute on function public.save_category_price_scale(jsonb) from public, anon;
revoke execute on function public.price_category_scales(jsonb) from public, anon;
grant execute on function public.save_category_price_scale(jsonb) to authenticated;
grant execute on function public.price_category_scales(jsonb) to authenticated;

-- Venta con escalas por categoria. Misma funcion que antes; solo cambia la rama de producto directo.

create or replace function public.create_sale_order_core(payload jsonb)
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
  v_item_idx integer := -1;
  v_scaled jsonb;
  v_scaled_line jsonb;
  v_scale_total numeric(14, 2);
  v_scale_id uuid;
  v_scale_min numeric(14, 2);
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

  -- Totales por renglon de las escalas por categoria (clave = indice 0-based del renglon).
  select coalesce(
    jsonb_object_agg(s.item_index::text, jsonb_build_object('total', s.line_total, 'scaleId', s.scale_id, 'minQty', s.tier_min_qty)),
    '{}'::jsonb
  )
  into v_scaled
  from public.price_category_scales(payload -> 'items') s;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    v_item_idx := v_item_idx + 1;
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

      v_scaled_line := v_scaled -> v_item_idx::text;

      if v_scaled_line is not null then
        -- Renglon afectado por una escala por categoria: el servidor fija el total del renglon.
        v_scale_total := (v_scaled_line ->> 'total')::numeric;
        v_scale_id := (v_scaled_line ->> 'scaleId')::uuid;
        v_scale_min := (v_scaled_line ->> 'minQty')::numeric;
        v_expected := round(v_scale_total / v_qty, 2);
        v_unit_price := coalesce(nullif(v_item ->> 'unitPrice', '')::numeric, v_expected);

        if v_unit_price <= 0 then
          raise exception 'El precio unitario debe ser mayor a cero';
        end if;

        if abs(round(v_unit_price * v_qty, 2) - v_scale_total) <= 0.01 * (v_qty + 1) then
          v_line_total := v_scale_total;
        elsif v_is_admin then
          v_line_total := round(v_unit_price * v_qty, 2);
        else
          raise exception 'El precio unitario debe coincidir con el precio de lista; solo un administrador puede cambiarlo';
        end if;

        v_unit_price := greatest(round(v_line_total / v_qty, 2), 0.01);
      else
        v_scale_id := null;
        v_scale_min := null;
        v_expected := public.resolve_product_price(v_product_id, v_tier_qty);
        v_unit_price := coalesce(nullif(v_item ->> 'unitPrice', '')::numeric, v_expected);

        if v_unit_price <= 0 then
          raise exception 'El precio unitario debe ser mayor a cero';
        end if;

        if not v_is_admin and round(v_unit_price, 2) <> v_expected then
          raise exception 'El precio unitario debe coincidir con el precio de lista; solo un administrador puede cambiarlo';
        end if;

        v_line_total := round(v_qty * v_unit_price, 2);
      end if;

      insert into public.sales_order_items (
        sales_order_id, product_id, quantity, unit_price, line_total, list_price,
        price_scale_id, price_scale_min_qty
      )
      values (
        v_order_id, v_product_id, v_qty, v_unit_price, v_line_total, v_expected,
        v_scale_id, v_scale_min
      );

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

revoke execute on function public.create_sale_order_core(jsonb) from public, anon, authenticated;
