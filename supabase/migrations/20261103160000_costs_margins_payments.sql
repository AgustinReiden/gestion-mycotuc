-- Costos (promedio ponderado), margen por venta y cobros parciales.

alter table public.supplies add column if not exists avg_cost numeric(14, 4) not null default 0;
alter table public.products add column if not exists avg_cost numeric(14, 4) not null default 0;

alter table public.production_batch_inputs add column if not exists unit_cost numeric(14, 4);
alter table public.production_batch_outputs add column if not exists unit_cost numeric(14, 4);
alter table public.production_batches
  add column if not exists total_cost numeric(14, 2),
  add column if not exists unit_cost numeric(14, 4);
alter table public.sales_order_items add column if not exists unit_cost numeric(14, 4);

alter table public.sales_orders
  add column if not exists amount_paid numeric(14, 2) not null default 0;

alter table public.sales_orders
  add constraint sales_orders_amount_paid_nonnegative check (amount_paid >= 0);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text,
  paid_at date not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

create index sale_payments_order_idx on public.sale_payments (sales_order_id);

alter table public.sale_payments enable row level security;
create policy "authenticated read sale payments" on public.sale_payments
for select to authenticated using (true);
revoke insert, update, delete on public.sale_payments from anon, authenticated;

-- Compras: recalcula el costo promedio ponderado de cada insumo comprado.
alter function public.register_supply_purchase(jsonb) rename to register_supply_purchase_core;
revoke execute on function public.register_supply_purchase_core(jsonb) from public, anon, authenticated;

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
    select supply_id, sum(quantity) as qty, sum(line_total) as cost
    from public.purchase_items
    where purchase_id = v_purchase.id
    group by supply_id
    order by supply_id
  loop
    v_prior := greatest(public.current_inventory_stock('supply', r.supply_id) - r.qty, 0);

    update public.supplies
    set avg_cost = round((v_prior * avg_cost + r.cost) / (v_prior + r.qty), 4)
    where id = r.supply_id;
  end loop;

  return v_purchase;
end;
$$;

-- Produccion: al cerrar el lote se fija el costo con el promedio vigente de los insumos.
alter function public.create_production_batch(jsonb) rename to create_production_batch_core;
revoke execute on function public.create_production_batch_core(jsonb) from public, anon, authenticated;

create or replace function public.create_production_batch(payload jsonb)
returns public.production_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.production_batches;
  v_total numeric(14, 2);
  v_out_qty numeric;
  v_unit numeric(14, 4);
  r record;
  v_prior numeric;
begin
  v_batch := public.create_production_batch_core(payload);

  if v_batch.status = 'completed' and v_batch.inventory_posted_at is not null and v_batch.total_cost is null then
    update public.production_batch_inputs pbi
    set unit_cost = s.avg_cost
    from public.supplies s
    where s.id = pbi.supply_id and pbi.batch_id = v_batch.id;

    select coalesce(sum(round(quantity * unit_cost, 2)), 0)
    into v_total
    from public.production_batch_inputs
    where batch_id = v_batch.id;

    select sum(quantity) into v_out_qty
    from public.production_batch_outputs
    where batch_id = v_batch.id;

    v_unit := case when coalesce(v_out_qty, 0) > 0 then round(v_total / v_out_qty, 4) else 0 end;

    update public.production_batch_outputs set unit_cost = v_unit where batch_id = v_batch.id;

    for r in
      select product_id, sum(quantity) as qty
      from public.production_batch_outputs
      where batch_id = v_batch.id
      group by product_id
      order by product_id
    loop
      v_prior := greatest(public.current_inventory_stock('product', r.product_id) - r.qty, 0);

      update public.products
      set avg_cost = round((v_prior * avg_cost + r.qty * v_unit) / (v_prior + r.qty), 4)
      where id = r.product_id;
    end loop;

    update public.production_batches
    set total_cost = v_total, unit_cost = v_unit
    where id = v_batch.id
    returning * into v_batch;
  end if;

  return v_batch;
end;
$$;

-- Venta: congela el costo unitario de cada linea y registra el cobro inicial.
alter function public.create_sale_order(jsonb) rename to create_sale_order_core;
revoke execute on function public.create_sale_order_core(jsonb) from public, anon, authenticated;

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

  update public.sales_order_items soi
  set unit_cost = p.avg_cost
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

-- Cobros: 'paid' salda el saldo, 'partial' registra un cobro por "amount", 'pending' (admin) borra cobros.
create or replace function public.update_sale_payment_status(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders;
  v_status public.payment_status := (payload ->> 'paymentStatus')::public.payment_status;
  v_method text := nullif(trim(payload ->> 'paymentMethod'), '');
  v_paid_at date := nullif(payload ->> 'paidAt', '')::date;
  v_amount numeric(14, 2) := nullif(payload ->> 'amount', '')::numeric;
  v_balance numeric(14, 2);
begin
  perform public.require_operating_user();
  perform public.assert_payment_consistency(v_status, v_method, v_paid_at);

  select * into v_order
  from public.sales_orders
  where id = (payload ->> 'saleOrderId')::uuid
  for update;

  if v_order.id is null then
    raise exception 'Venta inexistente';
  end if;

  if v_order.voided_at is not null then
    raise exception 'No se puede actualizar el cobro de una venta anulada';
  end if;

  v_balance := v_order.total_amount - v_order.amount_paid;

  if v_status = 'pending' then
    perform public.require_admin();

    delete from public.sale_payments where sales_order_id = v_order.id;

    update public.sales_orders
    set payment_status = 'pending', payment_method = null, paid_at = null, amount_paid = 0
    where id = v_order.id
    returning * into v_order;
  elsif v_status = 'paid' then
    if v_balance > 0 then
      insert into public.sale_payments (sales_order_id, amount, payment_method, paid_at, created_by)
      values (v_order.id, v_balance, v_method, v_paid_at, auth.uid());
    end if;

    update public.sales_orders
    set payment_status = 'paid', payment_method = v_method, paid_at = v_paid_at, amount_paid = total_amount
    where id = v_order.id
    returning * into v_order;
  else
    if v_amount is null or v_amount <= 0 or v_amount >= v_balance then
      raise exception 'El cobro parcial debe ser mayor a cero y menor al saldo pendiente';
    end if;

    insert into public.sale_payments (sales_order_id, amount, payment_method, paid_at, created_by)
    values (v_order.id, v_amount, v_method, v_paid_at, auth.uid());

    update public.sales_orders
    set payment_status = 'partial', payment_method = v_method, paid_at = v_paid_at,
        amount_paid = amount_paid + v_amount
    where id = v_order.id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.register_supply_purchase(jsonb) from public, anon;
revoke execute on function public.create_production_batch(jsonb) from public, anon;
revoke execute on function public.create_sale_order(jsonb) from public, anon;
revoke execute on function public.update_sale_payment_status(jsonb) from public, anon;
grant execute on function public.register_supply_purchase(jsonb) to authenticated;
grant execute on function public.create_production_batch(jsonb) to authenticated;
grant execute on function public.create_sale_order(jsonb) to authenticated;
grant execute on function public.update_sale_payment_status(jsonb) to authenticated;
