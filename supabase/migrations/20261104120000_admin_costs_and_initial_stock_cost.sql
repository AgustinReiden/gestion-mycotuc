-- Costos solo para admin a nivel de datos (B2) y stock inicial con costo (B6).
--
-- B2. `authenticated` deja de tener SELECT de tabla en las siete tablas con costos y recibe SELECT
--     por columna sobre todas las columnas que NO son costo. Los costos se leen solo con las
--     funciones get_*_costs(), que exigen rol admin. Consecuencias:
--       * un select('*') o un select de columna de costo sobre esas tablas FALLA para
--         authenticated (permission denied); la app selecciona columnas explicitas;
--       * una columna nueva en estas tablas NO queda visible hasta que se la otorgue (ver el DO
--         de abajo: volver a correrlo otorga todas las columnas que no sean costo);
--       * las funciones SECURITY DEFINER (ventas, lotes, compras, anulaciones) siguen leyendo
--         costos porque corren como duenio; las que DEVUELVEN filas con costos a cualquier rol
--         (upsert_product, upsert_supply, create_production_batch) ahora los devuelven en null
--         si quien llama no es admin.
--
-- B6. Regla de costo promedio (avg_cost; 0 significa "sin costo conocido"):
--       * Una entrada CON costo (compra, lote, ajuste positivo con unitCost) pondera:
--           avg = (stock_previo * avg + qty * costo) / (stock_previo + qty)
--         donde stock_previo cuenta como 0 si el avg vigente es 0 (ese stock no tiene costo y no
--         debe diluir). Ejemplo: 10 u por ajuste sin costo + compra 10 @ 100 -> avg 100.
--       * Una entrada SIN costo (ajuste positivo sin unitCost, lote cuyos insumos no tienen costo)
--         no toca el avg: se asume que esas unidades valen el promedio vigente.
--       * Las salidas (ventas, consumos, ajustes negativos) no cambian el avg.
--       * set_average_cost (admin, con motivo) corrige el avg a mano y queda registrado.
--       * Al vender, si el avg es 0 la linea guarda unit_cost NULL ("sin costo"), no 0.
--     Cada cambio de avg por ajuste o correccion manual queda en average_cost_changes.

-- ---------------------------------------------------------------- auditoria de costos
create table if not exists public.average_cost_changes (
  id uuid primary key default gen_random_uuid(),
  entity_type public.entity_type not null,
  entity_id uuid not null,
  source text not null check (source in ('stock_adjustment', 'manual_correction')),
  previous_avg_cost numeric(14, 4) not null,
  new_avg_cost numeric(14, 4) not null,
  quantity numeric(14, 2),
  unit_cost numeric(14, 4),
  inventory_movement_id uuid references public.inventory_movements (id) on delete set null,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists average_cost_changes_entity_idx
  on public.average_cost_changes (entity_type, entity_id, created_at desc);

alter table public.average_cost_changes enable row level security;
drop policy if exists "admin read average cost changes" on public.average_cost_changes;
create policy "admin read average cost changes" on public.average_cost_changes
for select to authenticated using (public.is_admin());
revoke all on public.average_cost_changes from public, anon, authenticated;
grant select on public.average_cost_changes to authenticated;

-- ---------------------------------------------------------------- B2: SELECT por columna
-- Revocar el SELECT de tabla tambien revoca los SELECT por columna previos, asi que el bloque es
-- idempotente: siempre deja exactamente "todas las columnas menos las de costo".
do $$
declare
  v_cost_columns constant jsonb := jsonb_build_object(
    'products', jsonb_build_array('avg_cost'),
    'supplies', jsonb_build_array('avg_cost'),
    'sales_order_items', jsonb_build_array('unit_cost'),
    'purchase_items', jsonb_build_array('unit_cost', 'line_total'),
    'production_batches', jsonb_build_array('total_cost', 'unit_cost'),
    'production_batch_inputs', jsonb_build_array('unit_cost'),
    'production_batch_outputs', jsonb_build_array('unit_cost')
  );
  v_table text;
  v_columns text;
begin
  for v_table in select jsonb_object_keys(v_cost_columns)
  loop
    execute format('revoke select on table public.%I from public, anon, authenticated', v_table);

    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_table
      and c.column_name not in (select jsonb_array_elements_text(v_cost_columns -> v_table));

    execute format('grant select (%s) on table public.%I to authenticated', v_columns, v_table);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- B2: lectura de costos (admin)
create or replace function public.get_product_costs()
returns table (id uuid, avg_cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query select p.id, p.avg_cost from public.products p;
end;
$$;

create or replace function public.get_supply_costs()
returns table (id uuid, avg_cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query select s.id, s.avg_cost from public.supplies s;
end;
$$;

create or replace function public.get_sale_item_costs()
returns table (id uuid, unit_cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query select soi.id, soi.unit_cost from public.sales_order_items soi;
end;
$$;

create or replace function public.get_batch_costs()
returns table (id uuid, total_cost numeric, unit_cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query select pb.id, pb.total_cost, pb.unit_cost from public.production_batches pb;
end;
$$;

create or replace function public.get_batch_input_costs()
returns table (id uuid, batch_id uuid, unit_cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query select pbi.id, pbi.batch_id, pbi.unit_cost from public.production_batch_inputs pbi;
end;
$$;

create or replace function public.get_purchase_item_costs()
returns table (id uuid, purchase_id uuid, unit_cost numeric, line_total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query select pi.id, pi.purchase_id, pi.unit_cost, pi.line_total from public.purchase_items pi;
end;
$$;

-- ---------------------------------------------------------------- B2: RPC que devuelven filas con costo
-- upsert_product / upsert_supply: la implementacion pasa a *_core y el envoltorio oculta avg_cost
-- a quien no es admin. El rename va protegido para poder correr la migracion dos veces.
do $$
begin
  if to_regprocedure('public.upsert_product_core(jsonb)') is null then
    alter function public.upsert_product(jsonb) rename to upsert_product_core;
  end if;

  if to_regprocedure('public.upsert_supply_core(jsonb)') is null then
    alter function public.upsert_supply(jsonb) rename to upsert_supply_core;
  end if;
end;
$$;

revoke execute on function public.upsert_product_core(jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_supply_core(jsonb) from public, anon, authenticated;

create or replace function public.upsert_product(payload jsonb)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
begin
  v_product := public.upsert_product_core(payload);

  if not public.is_admin() then
    v_product.avg_cost := null;
  end if;

  return v_product;
end;
$$;

create or replace function public.upsert_supply(payload jsonb)
returns public.supplies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supply public.supplies;
begin
  v_supply := public.upsert_supply_core(payload);

  if not public.is_admin() then
    v_supply.avg_cost := null;
  end if;

  return v_supply;
end;
$$;

-- ---------------------------------------------------------------- B6: compras
create or replace function public.register_supply_purchase(payload jsonb)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases;
  r record;
  v_prior numeric;
begin
  v_purchase := public.register_supply_purchase_core(payload);

  for r in
    select pi.supply_id, sum(pi.quantity) as qty, sum(pi.line_total) as cost, s.avg_cost
    from public.purchase_items pi
    join public.supplies s on s.id = pi.supply_id
    where pi.purchase_id = v_purchase.id
    group by pi.supply_id, s.avg_cost
    order by pi.supply_id
  loop
    -- El stock previo sin costo (avg 0) no diluye: la compra fija el promedio.
    v_prior := case
      when r.avg_cost > 0 then greatest(public.current_inventory_stock('supply', r.supply_id) - r.qty, 0)
      else 0
    end;

    update public.supplies
    set avg_cost = round((v_prior * r.avg_cost + r.cost) / (v_prior + r.qty), 4)
    where id = r.supply_id;
  end loop;

  return v_purchase;
end;
$$;

-- ---------------------------------------------------------------- B6: produccion
create or replace function public.create_production_batch(payload jsonb)
returns public.production_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.production_batches;
  v_total numeric(14, 2);
  v_known_inputs integer;
  v_out_qty numeric;
  v_unit numeric(14, 4);
  r record;
  v_prior numeric;
begin
  v_batch := public.create_production_batch_core(payload);

  if v_batch.status = 'completed' and v_batch.inventory_posted_at is not null and v_batch.total_cost is null then
    -- Insumo con avg 0 = sin costo conocido: queda NULL, no 0.
    update public.production_batch_inputs pbi
    set unit_cost = nullif(s.avg_cost, 0)
    from public.supplies s
    where s.id = pbi.supply_id and pbi.batch_id = v_batch.id;

    select coalesce(sum(round(quantity * unit_cost, 2)), 0), count(unit_cost)
    into v_total, v_known_inputs
    from public.production_batch_inputs
    where batch_id = v_batch.id;

    -- Sin ningun insumo con costo el lote queda "sin costo" y no toca el promedio del producto.
    if v_known_inputs > 0 then
      select sum(quantity) into v_out_qty
      from public.production_batch_outputs
      where batch_id = v_batch.id;

      v_unit := case when coalesce(v_out_qty, 0) > 0 then round(v_total / v_out_qty, 4) else 0 end;

      update public.production_batch_outputs set unit_cost = v_unit where batch_id = v_batch.id;

      if v_unit > 0 then
        for r in
          select pbo.product_id, sum(pbo.quantity) as qty, p.avg_cost
          from public.production_batch_outputs pbo
          join public.products p on p.id = pbo.product_id
          where pbo.batch_id = v_batch.id
          group by pbo.product_id, p.avg_cost
          order by pbo.product_id
        loop
          v_prior := case
            when r.avg_cost > 0 then greatest(public.current_inventory_stock('product', r.product_id) - r.qty, 0)
            else 0
          end;

          update public.products
          set avg_cost = round((v_prior * r.avg_cost + r.qty * v_unit) / (v_prior + r.qty), 4)
          where id = r.product_id;
        end loop;
      end if;

      update public.production_batches
      set total_cost = v_total, unit_cost = v_unit
      where id = v_batch.id
      returning * into v_batch;
    end if;
  end if;

  if not public.is_admin() then
    v_batch.total_cost := null;
    v_batch.unit_cost := null;
  end if;

  return v_batch;
end;
$$;

-- ---------------------------------------------------------------- B6: ventas
create or replace function public.create_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders;
  v_amount numeric(14, 2) := 0;
begin
  v_order := public.create_sale_order_core(payload);

  -- Producto sin costo conocido (avg 0): la linea queda "sin costo" (NULL), no con margen 100%.
  update public.sales_order_items soi
  set unit_cost = nullif(p.avg_cost, 0)
  from public.products p
  where p.id = soi.product_id and soi.sales_order_id = v_order.id;

  if v_order.payment_status = 'paid' then
    v_amount := v_order.total_amount;
  elsif v_order.payment_status = 'partial' then
    v_amount := nullif(payload ->> 'amountPaid', '')::numeric;

    if v_amount is null or v_amount <= 0 or v_amount >= v_order.total_amount then
      raise exception 'El cobro parcial debe ser mayor a cero y menor al total de la venta';
    end if;
  end if;

  if v_amount > 0 then
    insert into public.sale_payments (sales_order_id, amount, payment_method, paid_at, created_by)
    values (v_order.id, v_amount, v_order.payment_method, v_order.paid_at, auth.uid());

    update public.sales_orders
    set amount_paid = v_amount
    where id = v_order.id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

-- Lineas ya vendidas con costo 0 (productos sin costo cargado) pasan a "sin costo".
update public.sales_order_items set unit_cost = null where unit_cost = 0;

-- ---------------------------------------------------------------- B6: ajuste de stock con costo
create or replace function public.apply_stock_adjustment(payload jsonb)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_entity_type public.entity_type := (payload ->> 'entityType')::public.entity_type;
  v_entity_id uuid := (payload ->> 'entityId')::uuid;
  v_quantity numeric := (payload ->> 'quantity')::numeric;
  v_unit_cost numeric := nullif(payload ->> 'unitCost', '')::numeric;
  v_notes text := nullif(trim(payload ->> 'notes'), '');
  v_old numeric;
  v_new numeric;
  v_prior numeric;
  v_movement public.inventory_movements;
begin
  v_user_id := public.require_admin();

  if v_notes is null then
    raise exception 'El motivo del ajuste es obligatorio';
  end if;

  if v_unit_cost is not null then
    if v_unit_cost <= 0 then
      raise exception 'El costo unitario debe ser mayor a cero';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'El costo unitario solo se informa en ajustes positivos';
    end if;

    if v_entity_type = 'product' then
      select avg_cost into v_old from public.products where id = v_entity_id for update;
    elsif v_entity_type = 'supply' then
      select avg_cost into v_old from public.supplies where id = v_entity_id for update;
    end if;

    -- Stock previo que tiene costo: si el avg vigente es 0 ese stock no cuenta.
    v_prior := case
      when coalesce(v_old, 0) > 0 then greatest(public.current_inventory_stock(v_entity_type, v_entity_id), 0)
      else 0
    end;
  end if;

  v_movement := public.apply_stock_adjustment_impl(payload);

  if v_unit_cost is not null then
    v_new := round((v_prior * coalesce(v_old, 0) + v_movement.quantity * v_unit_cost) / (v_prior + v_movement.quantity), 4);

    if v_entity_type = 'product' then
      update public.products set avg_cost = v_new where id = v_entity_id;
    else
      update public.supplies set avg_cost = v_new where id = v_entity_id;
    end if;

    insert into public.average_cost_changes (
      entity_type, entity_id, source, previous_avg_cost, new_avg_cost,
      quantity, unit_cost, inventory_movement_id, reason, created_by
    )
    values (
      v_entity_type, v_entity_id, 'stock_adjustment', coalesce(v_old, 0), v_new,
      v_movement.quantity, v_unit_cost, v_movement.id, v_notes, v_user_id
    );
  end if;

  return v_movement;
end;
$$;

-- ---------------------------------------------------------------- B6: correccion manual del promedio
create or replace function public.set_average_cost(payload jsonb)
returns public.average_cost_changes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_entity_type public.entity_type := (payload ->> 'entityType')::public.entity_type;
  v_entity_id uuid := (payload ->> 'entityId')::uuid;
  v_avg numeric := nullif(payload ->> 'avgCost', '')::numeric;
  v_reason text := nullif(trim(payload ->> 'reason'), '');
  v_old numeric;
  v_change public.average_cost_changes;
begin
  v_user_id := public.require_admin();

  if v_reason is null then
    raise exception 'El motivo de la correccion de costo es obligatorio';
  end if;

  if v_avg is null or v_avg < 0 then
    raise exception 'El costo promedio debe ser cero o mayor';
  end if;

  if v_entity_type = 'product' then
    select avg_cost into v_old from public.products where id = v_entity_id for update;
    if not found then
      raise exception 'Producto inexistente';
    end if;
    update public.products set avg_cost = round(v_avg, 4) where id = v_entity_id;
  elsif v_entity_type = 'supply' then
    select avg_cost into v_old from public.supplies where id = v_entity_id for update;
    if not found then
      raise exception 'Insumo inexistente';
    end if;
    update public.supplies set avg_cost = round(v_avg, 4) where id = v_entity_id;
  else
    raise exception 'Tipo de entidad invalido';
  end if;

  insert into public.average_cost_changes (
    entity_type, entity_id, source, previous_avg_cost, new_avg_cost, reason, created_by
  )
  values (v_entity_type, v_entity_id, 'manual_correction', v_old, round(v_avg, 4), v_reason, v_user_id)
  returning * into v_change;

  return v_change;
end;
$$;

-- ---------------------------------------------------------------- permisos de funciones
revoke execute on function public.get_product_costs() from public, anon;
revoke execute on function public.get_supply_costs() from public, anon;
revoke execute on function public.get_sale_item_costs() from public, anon;
revoke execute on function public.get_batch_costs() from public, anon;
revoke execute on function public.get_batch_input_costs() from public, anon;
revoke execute on function public.get_purchase_item_costs() from public, anon;
revoke execute on function public.upsert_product(jsonb) from public, anon;
revoke execute on function public.upsert_supply(jsonb) from public, anon;
revoke execute on function public.register_supply_purchase(jsonb) from public, anon;
revoke execute on function public.create_production_batch(jsonb) from public, anon;
revoke execute on function public.create_sale_order(jsonb) from public, anon;
revoke execute on function public.apply_stock_adjustment(jsonb) from public, anon;
revoke execute on function public.set_average_cost(jsonb) from public, anon;

grant execute on function public.get_product_costs() to authenticated;
grant execute on function public.get_supply_costs() to authenticated;
grant execute on function public.get_sale_item_costs() to authenticated;
grant execute on function public.get_batch_costs() to authenticated;
grant execute on function public.get_batch_input_costs() to authenticated;
grant execute on function public.get_purchase_item_costs() to authenticated;
grant execute on function public.upsert_product(jsonb) to authenticated;
grant execute on function public.upsert_supply(jsonb) to authenticated;
grant execute on function public.register_supply_purchase(jsonb) to authenticated;
grant execute on function public.create_production_batch(jsonb) to authenticated;
grant execute on function public.create_sale_order(jsonb) to authenticated;
grant execute on function public.apply_stock_adjustment(jsonb) to authenticated;
grant execute on function public.set_average_cost(jsonb) to authenticated;
