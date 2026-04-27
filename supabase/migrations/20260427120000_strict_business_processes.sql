create or replace function public.current_inventory_stock(
  p_entity_type public.entity_type,
  p_entity_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)::numeric(14, 2)
  from public.inventory_movements
  where entity_type = p_entity_type
    and entity_id = p_entity_id;
$$;

alter table public.sales_orders
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users (id),
  add column if not exists void_reason text;

alter table public.purchases
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users (id),
  add column if not exists void_reason text;

alter table public.expenses
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users (id),
  add column if not exists void_reason text;

alter table public.production_batches
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users (id),
  add column if not exists void_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_sale_price_nonnegative'
  ) then
    alter table public.products
      add constraint products_sale_price_nonnegative check (sale_price >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_min_stock_nonnegative'
  ) then
    alter table public.products
      add constraint products_min_stock_nonnegative check (min_stock >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'supplies_min_stock_nonnegative'
  ) then
    alter table public.supplies
      add constraint supplies_min_stock_nonnegative check (min_stock >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sales_order_items_positive_values'
  ) then
    alter table public.sales_order_items
      add constraint sales_order_items_positive_values
      check (quantity > 0 and unit_price > 0 and line_total > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'purchase_items_positive_values'
  ) then
    alter table public.purchase_items
      add constraint purchase_items_positive_values
      check (quantity > 0 and unit_cost > 0 and line_total > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expenses_amount_positive'
  ) then
    alter table public.expenses
      add constraint expenses_amount_positive check (amount > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_quantity_not_zero'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_quantity_not_zero check (quantity <> 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'production_batch_inputs_quantity_positive'
  ) then
    alter table public.production_batch_inputs
      add constraint production_batch_inputs_quantity_positive check (quantity > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'production_batch_outputs_quantity_positive'
  ) then
    alter table public.production_batch_outputs
      add constraint production_batch_outputs_quantity_positive check (quantity > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'production_batches_expected_qty_nonnegative'
  ) then
    alter table public.production_batches
      add constraint production_batches_expected_qty_nonnegative
      check (expected_qty is null or expected_qty >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'production_batches_actual_qty_nonnegative'
  ) then
    alter table public.production_batches
      add constraint production_batches_actual_qty_nonnegative
      check (actual_qty is null or actual_qty >= 0) not valid;
  end if;
end;
$$;

drop policy if exists "authenticated full access sales channels" on public.sales_channels;
drop policy if exists "authenticated full access expense categories" on public.expense_categories;
drop policy if exists "authenticated full access contacts" on public.contacts;
drop policy if exists "authenticated full access products" on public.products;
drop policy if exists "authenticated full access supplies" on public.supplies;
drop policy if exists "authenticated full access sales orders" on public.sales_orders;
drop policy if exists "authenticated full access sales order items" on public.sales_order_items;
drop policy if exists "authenticated full access purchases" on public.purchases;
drop policy if exists "authenticated full access purchase items" on public.purchase_items;
drop policy if exists "authenticated full access expenses" on public.expenses;
drop policy if exists "authenticated full access production batches" on public.production_batches;
drop policy if exists "authenticated full access production batch inputs" on public.production_batch_inputs;
drop policy if exists "authenticated full access production batch outputs" on public.production_batch_outputs;
drop policy if exists "authenticated full access inventory movements" on public.inventory_movements;

create policy "authenticated read sales channels" on public.sales_channels
for select to authenticated using (true);

create policy "authenticated read expense categories" on public.expense_categories
for select to authenticated using (true);

create policy "authenticated read contacts" on public.contacts
for select to authenticated using (true);

create policy "authenticated read products" on public.products
for select to authenticated using (true);

create policy "authenticated read supplies" on public.supplies
for select to authenticated using (true);

create policy "authenticated read sales orders" on public.sales_orders
for select to authenticated using (true);

create policy "authenticated read sales order items" on public.sales_order_items
for select to authenticated using (true);

create policy "authenticated read purchases" on public.purchases
for select to authenticated using (true);

create policy "authenticated read purchase items" on public.purchase_items
for select to authenticated using (true);

create policy "authenticated read expenses" on public.expenses
for select to authenticated using (true);

create policy "authenticated read production batches" on public.production_batches
for select to authenticated using (true);

create policy "authenticated read production batch inputs" on public.production_batch_inputs
for select to authenticated using (true);

create policy "authenticated read production batch outputs" on public.production_batch_outputs
for select to authenticated using (true);

create policy "authenticated read inventory movements" on public.inventory_movements
for select to authenticated using (true);

create or replace function public.require_operating_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.assert_payment_consistency(
  p_status public.payment_status,
  p_method text,
  p_paid_at date
)
returns void
language plpgsql
immutable
as $$
begin
  if p_status = 'pending' and (p_method is not null or p_paid_at is not null) then
    raise exception 'Una venta pendiente no debe tener metodo ni fecha de cobro';
  end if;

  if p_status in ('partial', 'paid') and (p_method is null or p_paid_at is null) then
    raise exception 'Las ventas parciales o pagadas requieren metodo y fecha de cobro';
  end if;
end;
$$;

create or replace function public.upsert_contact(payload jsonb)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts;
  v_contact_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_type public.contact_type := (payload ->> 'type')::public.contact_type;
  v_name text := nullif(trim(payload ->> 'name'), '');
begin
  perform public.require_operating_user();

  if v_type is null then
    raise exception 'El tipo de contacto es obligatorio';
  end if;

  if v_name is null or length(v_name) < 2 then
    raise exception 'El nombre del contacto es obligatorio';
  end if;

  if v_contact_id is not null then
    update public.contacts
    set
      type = v_type,
      name = v_name,
      phone = nullif(trim(payload ->> 'phone'), ''),
      email = nullif(trim(payload ->> 'email'), ''),
      notes = nullif(trim(payload ->> 'notes'), ''),
      is_active = coalesce((payload ->> 'isActive')::boolean, true)
    where id = v_contact_id
    returning * into v_contact;

    if v_contact.id is null then
      raise exception 'Contacto inexistente';
    end if;
  else
    insert into public.contacts (type, name, phone, email, notes, is_active)
    values (
      v_type,
      v_name,
      nullif(trim(payload ->> 'phone'), ''),
      nullif(trim(payload ->> 'email'), ''),
      nullif(trim(payload ->> 'notes'), ''),
      coalesce((payload ->> 'isActive')::boolean, true)
    )
    returning * into v_contact;
  end if;

  return v_contact;
end;
$$;

create or replace function public.upsert_product(payload jsonb)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_product_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_name text := nullif(trim(payload ->> 'name'), '');
  v_category text := nullif(trim(payload ->> 'category'), '');
  v_unit text := nullif(trim(payload ->> 'unit'), '');
  v_sale_price numeric(14, 2) := coalesce((payload ->> 'salePrice')::numeric, 0);
  v_min_stock numeric(14, 2) := coalesce((payload ->> 'minStock')::numeric, 0);
begin
  perform public.require_operating_user();

  if v_name is null or length(v_name) < 2 then
    raise exception 'El nombre del producto es obligatorio';
  end if;

  if v_category is null or length(v_category) < 2 then
    raise exception 'La categoria del producto es obligatoria';
  end if;

  if v_unit is null then
    raise exception 'La unidad del producto es obligatoria';
  end if;

  if v_sale_price < 0 or v_min_stock < 0 then
    raise exception 'Los valores de precio y stock minimo no pueden ser negativos';
  end if;

  if v_product_id is not null then
    update public.products
    set
      name = v_name,
      category = v_category,
      unit = v_unit,
      sale_price = v_sale_price,
      min_stock = v_min_stock,
      notes = nullif(trim(payload ->> 'notes'), ''),
      is_active = coalesce((payload ->> 'isActive')::boolean, true)
    where id = v_product_id
    returning * into v_product;

    if v_product.id is null then
      raise exception 'Producto inexistente';
    end if;
  else
    insert into public.products (name, category, unit, sale_price, min_stock, notes, is_active)
    values (
      v_name,
      v_category,
      v_unit,
      v_sale_price,
      v_min_stock,
      nullif(trim(payload ->> 'notes'), ''),
      coalesce((payload ->> 'isActive')::boolean, true)
    )
    returning * into v_product;
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
  v_supply_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_name text := nullif(trim(payload ->> 'name'), '');
  v_unit text := nullif(trim(payload ->> 'unit'), '');
  v_min_stock numeric(14, 2) := coalesce((payload ->> 'minStock')::numeric, 0);
begin
  perform public.require_operating_user();

  if v_name is null or length(v_name) < 2 then
    raise exception 'El nombre del insumo es obligatorio';
  end if;

  if v_unit is null then
    raise exception 'La unidad del insumo es obligatoria';
  end if;

  if v_min_stock < 0 then
    raise exception 'El stock minimo no puede ser negativo';
  end if;

  if v_supply_id is not null then
    update public.supplies
    set
      name = v_name,
      unit = v_unit,
      min_stock = v_min_stock,
      notes = nullif(trim(payload ->> 'notes'), ''),
      is_active = coalesce((payload ->> 'isActive')::boolean, true)
    where id = v_supply_id
    returning * into v_supply;

    if v_supply.id is null then
      raise exception 'Insumo inexistente';
    end if;
  else
    insert into public.supplies (name, unit, min_stock, notes, is_active)
    values (
      v_name,
      v_unit,
      v_min_stock,
      nullif(trim(payload ->> 'notes'), ''),
      coalesce((payload ->> 'isActive')::boolean, true)
    )
    returning * into v_supply;
  end if;

  return v_supply;
end;
$$;

create or replace function public.create_manual_expense(payload jsonb)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
  v_user_id uuid := public.require_operating_user();
  v_category_id uuid := (payload ->> 'categoryId')::uuid;
  v_amount numeric(14, 2) := (payload ->> 'amount')::numeric;
  v_concept text := nullif(trim(payload ->> 'concept'), '');
begin
  if v_concept is null or length(v_concept) < 2 then
    raise exception 'El concepto del gasto es obligatorio';
  end if;

  if v_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  if not exists (
    select 1 from public.expense_categories where id = v_category_id and is_active
  ) then
    raise exception 'Categoria de gasto inexistente o inactiva';
  end if;

  insert into public.expenses (
    expense_date,
    concept,
    category_id,
    amount,
    notes,
    source,
    created_by
  )
  values (
    coalesce(nullif(payload ->> 'expenseDate', '')::date, current_date),
    v_concept,
    v_category_id,
    v_amount,
    nullif(trim(payload ->> 'notes'), ''),
    'manual',
    v_user_id
  )
  returning * into v_expense;

  return v_expense;
end;
$$;

create or replace function public.create_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders;
  v_item jsonb;
  v_total numeric(14, 2) := 0;
  v_available numeric(14, 2);
  v_product_id uuid;
  v_quantity numeric(14, 2);
  v_unit_price numeric(14, 2);
  v_order_id uuid := gen_random_uuid();
  v_sale_date date := coalesce(nullif(payload ->> 'saleDate', '')::date, current_date);
  v_created_by uuid := public.require_operating_user();
  v_payment_status public.payment_status := coalesce(
    nullif(payload ->> 'paymentStatus', '')::public.payment_status,
    'pending'
  );
  v_payment_method text := nullif(trim(payload ->> 'paymentMethod'), '');
  v_paid_at date := nullif(payload ->> 'paidAt', '')::date;
begin
  if payload is null then
    raise exception 'Payload requerido';
  end if;

  perform public.assert_payment_consistency(v_payment_status, v_payment_method, v_paid_at);

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'La venta debe incluir al menos un item';
  end if;

  if not exists (
    select 1
    from public.contacts
    where id = (payload ->> 'contactId')::uuid
      and type = 'client'
      and is_active
  ) then
    raise exception 'Cliente inexistente o inactivo';
  end if;

  if not exists (
    select 1
    from public.sales_channels
    where id = (payload ->> 'channelId')::uuid
      and is_active
  ) then
    raise exception 'Canal de venta inexistente o inactivo';
  end if;

  perform 1
  from public.products p
  where p.id in (
    select distinct (item ->> 'productId')::uuid
    from jsonb_array_elements(payload -> 'items') item
  )
  order by p.id
  for update;

  insert into public.sales_orders (
    id,
    contact_id,
    channel_id,
    sale_date,
    payment_status,
    payment_method,
    paid_at,
    notes,
    created_by
  )
  values (
    v_order_id,
    (payload ->> 'contactId')::uuid,
    (payload ->> 'channelId')::uuid,
    v_sale_date,
    v_payment_status,
    v_payment_method,
    v_paid_at,
    nullif(trim(payload ->> 'notes'), ''),
    v_created_by
  );

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := (v_item ->> 'unitPrice')::numeric;

    if v_quantity <= 0 then
      raise exception 'La cantidad debe ser mayor a cero';
    end if;

    if v_unit_price <= 0 then
      raise exception 'El precio unitario debe ser mayor a cero';
    end if;

    if not exists(select 1 from public.products where id = v_product_id and is_active) then
      raise exception 'Producto inexistente o inactivo';
    end if;

    v_available := public.current_inventory_stock('product', v_product_id);

    if v_available < v_quantity then
      raise exception 'Stock insuficiente para el producto %', v_product_id;
    end if;

    insert into public.sales_order_items (
      sales_order_id,
      product_id,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_order_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      round(v_quantity * v_unit_price, 2)
    );

    insert into public.inventory_movements (
      entity_type,
      entity_id,
      movement_type,
      quantity,
      movement_date,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      'product',
      v_product_id,
      'sale_out',
      round(v_quantity * -1, 2),
      v_sale_date::timestamp,
      'sale_order',
      v_order_id,
      nullif(trim(payload ->> 'notes'), ''),
      v_created_by
    );

    v_total := v_total + round(v_quantity * v_unit_price, 2);
  end loop;

  update public.sales_orders
  set
    subtotal_amount = v_total,
    total_amount = v_total
  where id = v_order_id
  returning * into v_order;

  return v_order;
end;
$$;

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
begin
  perform public.require_operating_user();
  perform public.assert_payment_consistency(v_status, v_method, v_paid_at);

  select *
  into v_order
  from public.sales_orders
  where id = (payload ->> 'saleOrderId')::uuid
  for update;

  if v_order.id is null then
    raise exception 'Venta inexistente';
  end if;

  if v_order.voided_at is not null then
    raise exception 'No se puede actualizar el cobro de una venta anulada';
  end if;

  update public.sales_orders
  set
    payment_status = v_status,
    payment_method = v_method,
    paid_at = v_paid_at
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.register_supply_purchase(payload jsonb)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases;
  v_item jsonb;
  v_total numeric(14, 2) := 0;
  v_purchase_id uuid := gen_random_uuid();
  v_purchase_date date := coalesce(nullif(payload ->> 'purchaseDate', '')::date, current_date);
  v_supply_id uuid;
  v_quantity numeric(14, 2);
  v_unit_cost numeric(14, 2);
  v_created_by uuid := public.require_operating_user();
  v_expense_category_id uuid;
begin
  if payload is null then
    raise exception 'Payload requerido';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'La compra debe incluir al menos un item';
  end if;

  if not exists (
    select 1
    from public.contacts
    where id = (payload ->> 'supplierId')::uuid
      and type = 'supplier'
      and is_active
  ) then
    raise exception 'Proveedor inexistente o inactivo';
  end if;

  select id
  into v_expense_category_id
  from public.expense_categories
  where lower(name) = 'insumos'
    and is_active
  limit 1;

  if v_expense_category_id is null then
    raise exception 'No existe la categoria de gasto Insumos';
  end if;

  perform 1
  from public.supplies s
  where s.id in (
    select distinct (item ->> 'supplyId')::uuid
    from jsonb_array_elements(payload -> 'items') item
  )
  order by s.id
  for update;

  insert into public.purchases (
    id,
    supplier_id,
    purchase_date,
    notes,
    created_by
  )
  values (
    v_purchase_id,
    (payload ->> 'supplierId')::uuid,
    v_purchase_date,
    nullif(trim(payload ->> 'notes'), ''),
    v_created_by
  );

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    v_supply_id := (v_item ->> 'supplyId')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_quantity <= 0 then
      raise exception 'La cantidad de compra debe ser mayor a cero';
    end if;

    if v_unit_cost <= 0 then
      raise exception 'El costo unitario debe ser mayor a cero';
    end if;

    if not exists(select 1 from public.supplies where id = v_supply_id and is_active) then
      raise exception 'Insumo inexistente o inactivo';
    end if;

    insert into public.purchase_items (
      purchase_id,
      supply_id,
      quantity,
      unit_cost,
      line_total
    )
    values (
      v_purchase_id,
      v_supply_id,
      v_quantity,
      v_unit_cost,
      round(v_quantity * v_unit_cost, 2)
    );

    insert into public.inventory_movements (
      entity_type,
      entity_id,
      movement_type,
      quantity,
      movement_date,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      'supply',
      v_supply_id,
      'purchase_in',
      round(v_quantity, 2),
      v_purchase_date::timestamp,
      'purchase',
      v_purchase_id,
      nullif(trim(payload ->> 'notes'), ''),
      v_created_by
    );

    update public.supplies
    set last_purchase_at = v_purchase_date
    where id = v_supply_id;

    v_total := v_total + round(v_quantity * v_unit_cost, 2);
  end loop;

  update public.purchases
  set total_amount = v_total
  where id = v_purchase_id
  returning * into v_purchase;

  insert into public.expenses (
    expense_date,
    concept,
    category_id,
    amount,
    source,
    notes,
    linked_purchase_id,
    created_by
  )
  values (
    v_purchase_date,
    'Compra de insumos',
    v_expense_category_id,
    v_total,
    'purchase',
    nullif(trim(payload ->> 'notes'), ''),
    v_purchase_id,
    v_created_by
  );

  return v_purchase;
end;
$$;

create or replace function public.create_production_batch(payload jsonb)
returns public.production_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.production_batches;
  v_existing public.production_batches;
  v_batch_id uuid := coalesce(nullif(payload ->> 'id', '')::uuid, gen_random_uuid());
  v_input jsonb;
  v_output jsonb;
  v_started_at date := coalesce(nullif(payload ->> 'startedAt', '')::date, current_date);
  v_completed_at date := nullif(payload ->> 'completedAt', '')::date;
  v_status public.batch_status := coalesce((payload ->> 'status')::public.batch_status, 'draft');
  v_created_by uuid := public.require_operating_user();
  v_has_insufficient_input boolean;
begin
  if payload is null then
    raise exception 'Payload requerido';
  end if;

  if nullif(payload ->> 'productId', '') is null then
    raise exception 'El lote debe tener un producto objetivo';
  end if;

  if not exists(select 1 from public.products where id = (payload ->> 'productId')::uuid and is_active) then
    raise exception 'Producto objetivo inexistente o inactivo';
  end if;

  if v_status = 'completed' then
    if v_completed_at is null then
      raise exception 'Un lote completado requiere fecha de cierre';
    end if;

    if jsonb_typeof(payload -> 'inputs') <> 'array' or jsonb_array_length(payload -> 'inputs') = 0 then
      raise exception 'No puedes completar un lote sin insumos consumidos';
    end if;

    if jsonb_typeof(payload -> 'outputs') <> 'array' or jsonb_array_length(payload -> 'outputs') = 0 then
      raise exception 'No puedes completar un lote sin salidas registradas';
    end if;
  end if;

  perform 1
  from public.supplies s
  where s.id in (
    select distinct (input ->> 'supplyId')::uuid
    from jsonb_array_elements(coalesce(payload -> 'inputs', '[]'::jsonb)) input
  )
  order by s.id
  for update;

  perform 1
  from public.products p
  where p.id in (
    select (payload ->> 'productId')::uuid
    union
    select distinct (output ->> 'productId')::uuid
    from jsonb_array_elements(coalesce(payload -> 'outputs', '[]'::jsonb)) output
  )
  order by p.id
  for update;

  if exists(select 1 from public.production_batches where id = v_batch_id) then
    select *
    into v_existing
    from public.production_batches
    where id = v_batch_id
    for update;

    if v_existing.inventory_posted_at is not null then
      raise exception 'Los lotes cerrados no pueden modificarse';
    end if;

    if v_existing.voided_at is not null then
      raise exception 'Los lotes anulados no pueden modificarse';
    end if;

    update public.production_batches
    set
      product_id = (payload ->> 'productId')::uuid,
      status = v_status,
      started_at = v_started_at,
      completed_at = v_completed_at,
      expected_qty = nullif(payload ->> 'expectedQty', '')::numeric,
      actual_qty = nullif(payload ->> 'actualQty', '')::numeric,
      notes = nullif(trim(payload ->> 'notes'), '')
    where id = v_batch_id
    returning * into v_batch;

    delete from public.production_batch_inputs where batch_id = v_batch_id;
    delete from public.production_batch_outputs where batch_id = v_batch_id;
  else
    insert into public.production_batches (
      id,
      product_id,
      status,
      started_at,
      completed_at,
      expected_qty,
      actual_qty,
      notes,
      created_by
    )
    values (
      v_batch_id,
      (payload ->> 'productId')::uuid,
      v_status,
      v_started_at,
      v_completed_at,
      nullif(payload ->> 'expectedQty', '')::numeric,
      nullif(payload ->> 'actualQty', '')::numeric,
      nullif(trim(payload ->> 'notes'), ''),
      v_created_by
    )
    returning * into v_batch;
  end if;

  if jsonb_typeof(payload -> 'inputs') = 'array' then
    for v_input in select * from jsonb_array_elements(payload -> 'inputs')
    loop
      if (v_input ->> 'quantity')::numeric <= 0 then
        raise exception 'Cada insumo del lote debe tener cantidad mayor a cero';
      end if;

      if not exists(select 1 from public.supplies where id = (v_input ->> 'supplyId')::uuid and is_active) then
        raise exception 'Insumo del lote inexistente o inactivo';
      end if;

      insert into public.production_batch_inputs (
        batch_id,
        supply_id,
        quantity
      )
      values (
        v_batch_id,
        (v_input ->> 'supplyId')::uuid,
        (v_input ->> 'quantity')::numeric
      );
    end loop;
  end if;

  if jsonb_typeof(payload -> 'outputs') = 'array' then
    for v_output in select * from jsonb_array_elements(payload -> 'outputs')
    loop
      if (v_output ->> 'quantity')::numeric <= 0 then
        raise exception 'Cada salida del lote debe tener cantidad mayor a cero';
      end if;

      if not exists(select 1 from public.products where id = (v_output ->> 'productId')::uuid and is_active) then
        raise exception 'Producto de salida inexistente o inactivo';
      end if;

      insert into public.production_batch_outputs (
        batch_id,
        product_id,
        quantity
      )
      values (
        v_batch_id,
        (v_output ->> 'productId')::uuid,
        (v_output ->> 'quantity')::numeric
      );
    end loop;
  end if;

  if v_batch.status = 'completed' then
    if not exists(
      select 1
      from public.production_batch_outputs
      where batch_id = v_batch_id
        and product_id = v_batch.product_id
    ) then
      raise exception 'La salida del lote debe incluir el producto objetivo';
    end if;

    select exists (
      select 1
      from (
        select
          pbi.supply_id,
          sum(pbi.quantity) as required_quantity
        from public.production_batch_inputs pbi
        where pbi.batch_id = v_batch_id
        group by pbi.supply_id
      ) required_inputs
      where public.current_inventory_stock('supply', required_inputs.supply_id) < required_inputs.required_quantity
    )
    into v_has_insufficient_input;

    if v_has_insufficient_input then
      raise exception 'Stock insuficiente en insumos para completar el lote';
    end if;
  end if;

  if v_batch.status = 'completed' and v_batch.inventory_posted_at is null then
    insert into public.inventory_movements (
      entity_type,
      entity_id,
      movement_type,
      quantity,
      movement_date,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    select
      'supply',
      pbi.supply_id,
      'production_out',
      round(pbi.quantity * -1, 2),
      coalesce(v_batch.completed_at, current_date)::timestamp,
      'production_batch',
      v_batch_id,
      v_batch.notes,
      v_created_by
    from public.production_batch_inputs pbi
    where pbi.batch_id = v_batch_id;

    insert into public.inventory_movements (
      entity_type,
      entity_id,
      movement_type,
      quantity,
      movement_date,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    select
      'product',
      pbo.product_id,
      'production_in',
      round(pbo.quantity, 2),
      coalesce(v_batch.completed_at, current_date)::timestamp,
      'production_batch',
      v_batch_id,
      v_batch.notes,
      v_created_by
    from public.production_batch_outputs pbo
    where pbo.batch_id = v_batch_id;

    update public.production_batches
    set inventory_posted_at = timezone('utc', now())
    where id = v_batch_id
    returning * into v_batch;
  end if;

  return v_batch;
end;
$$;

create or replace function public.apply_stock_adjustment(payload jsonb)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement public.inventory_movements;
  v_entity_type public.entity_type := (payload ->> 'entityType')::public.entity_type;
  v_entity_id uuid := (payload ->> 'entityId')::uuid;
  v_quantity numeric(14, 2) := (payload ->> 'quantity')::numeric;
  v_current_stock numeric(14, 2);
  v_created_by uuid := public.require_operating_user();
begin
  if v_quantity = 0 then
    raise exception 'La variacion no puede ser cero';
  end if;

  if v_entity_type = 'product' then
    perform 1 from public.products where id = v_entity_id for update;

    if not found then
      raise exception 'Producto inexistente';
    end if;
  elsif v_entity_type = 'supply' then
    perform 1 from public.supplies where id = v_entity_id for update;

    if not found then
      raise exception 'Insumo inexistente';
    end if;
  else
    raise exception 'Tipo de entidad invalido';
  end if;

  v_current_stock := public.current_inventory_stock(v_entity_type, v_entity_id);

  if v_current_stock + v_quantity < 0 then
    raise exception 'El ajuste dejaria stock negativo';
  end if;

  insert into public.inventory_movements (
    entity_type,
    entity_id,
    movement_type,
    quantity,
    movement_date,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  values (
    v_entity_type,
    v_entity_id,
    'adjustment',
    round(v_quantity, 2),
    coalesce(nullif(payload ->> 'movementDate', '')::date, current_date)::timestamp,
    'manual_adjustment',
    null,
    nullif(trim(payload ->> 'notes'), ''),
    v_created_by
  )
  returning * into v_movement;

  return v_movement;
end;
$$;

create or replace function public.reverse_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders;
  v_item public.sales_order_items;
  v_user_id uuid := public.require_operating_user();
  v_reason text := nullif(trim(payload ->> 'reason'), '');
begin
  select *
  into v_order
  from public.sales_orders
  where id = (payload ->> 'saleOrderId')::uuid
  for update;

  if v_order.id is null then
    raise exception 'Venta inexistente';
  end if;

  if v_order.voided_at is not null then
    raise exception 'La venta ya esta anulada';
  end if;

  perform 1
  from public.products p
  where p.id in (
    select distinct soi.product_id
    from public.sales_order_items soi
    where soi.sales_order_id = v_order.id
  )
  order by p.id
  for update;

  for v_item in
    select * from public.sales_order_items where sales_order_id = v_order.id
  loop
    insert into public.inventory_movements (
      entity_type,
      entity_id,
      movement_type,
      quantity,
      movement_date,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      'product',
      v_item.product_id,
      'adjustment',
      round(v_item.quantity, 2),
      timezone('utc', now()),
      'sale_order_reversal',
      v_order.id,
      coalesce(v_reason, 'Anulacion de venta'),
      v_user_id
    );
  end loop;

  update public.sales_orders
  set
    voided_at = timezone('utc', now()),
    voided_by = v_user_id,
    void_reason = v_reason
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.reverse_supply_purchase(payload jsonb)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases;
  v_item public.purchase_items;
  v_user_id uuid := public.require_operating_user();
  v_reason text := nullif(trim(payload ->> 'reason'), '');
  v_has_insufficient_stock boolean;
begin
  select *
  into v_purchase
  from public.purchases
  where id = (payload ->> 'purchaseId')::uuid
  for update;

  if v_purchase.id is null then
    raise exception 'Compra inexistente';
  end if;

  if v_purchase.voided_at is not null then
    raise exception 'La compra ya esta anulada';
  end if;

  perform 1
  from public.supplies s
  where s.id in (
    select distinct pi.supply_id
    from public.purchase_items pi
    where pi.purchase_id = v_purchase.id
  )
  order by s.id
  for update;

  select exists (
    select 1
    from (
      select supply_id, sum(quantity) as purchased_quantity
      from public.purchase_items
      where purchase_id = v_purchase.id
      group by supply_id
    ) purchased
    where public.current_inventory_stock('supply', purchased.supply_id) < purchased.purchased_quantity
  )
  into v_has_insufficient_stock;

  if v_has_insufficient_stock then
    raise exception 'No se puede anular la compra porque dejaria insumos con stock negativo';
  end if;

  for v_item in
    select * from public.purchase_items where purchase_id = v_purchase.id
  loop
    insert into public.inventory_movements (
      entity_type,
      entity_id,
      movement_type,
      quantity,
      movement_date,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      'supply',
      v_item.supply_id,
      'adjustment',
      round(v_item.quantity * -1, 2),
      timezone('utc', now()),
      'purchase_reversal',
      v_purchase.id,
      coalesce(v_reason, 'Anulacion de compra'),
      v_user_id
    );
  end loop;

  update public.purchases
  set
    voided_at = timezone('utc', now()),
    voided_by = v_user_id,
    void_reason = v_reason
  where id = v_purchase.id
  returning * into v_purchase;

  update public.expenses
  set
    voided_at = timezone('utc', now()),
    voided_by = v_user_id,
    void_reason = coalesce(v_reason, 'Anulacion de compra vinculada')
  where linked_purchase_id = v_purchase.id
    and voided_at is null;

  return v_purchase;
end;
$$;

create or replace function public.reverse_production_batch(payload jsonb)
returns public.production_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.production_batches;
  v_input public.production_batch_inputs;
  v_output public.production_batch_outputs;
  v_user_id uuid := public.require_operating_user();
  v_reason text := nullif(trim(payload ->> 'reason'), '');
  v_has_insufficient_output boolean;
begin
  select *
  into v_batch
  from public.production_batches
  where id = (payload ->> 'batchId')::uuid
  for update;

  if v_batch.id is null then
    raise exception 'Lote inexistente';
  end if;

  if v_batch.voided_at is not null or v_batch.status = 'cancelled' then
    raise exception 'El lote ya esta anulado';
  end if;

  perform 1
  from public.supplies s
  where s.id in (
    select distinct pbi.supply_id
    from public.production_batch_inputs pbi
    where pbi.batch_id = v_batch.id
  )
  order by s.id
  for update;

  perform 1
  from public.products p
  where p.id in (
    select distinct pbo.product_id
    from public.production_batch_outputs pbo
    where pbo.batch_id = v_batch.id
  )
  order by p.id
  for update;

  if v_batch.inventory_posted_at is not null then
    select exists (
      select 1
      from (
        select product_id, sum(quantity) as produced_quantity
        from public.production_batch_outputs
        where batch_id = v_batch.id
        group by product_id
      ) produced
      where public.current_inventory_stock('product', produced.product_id) < produced.produced_quantity
    )
    into v_has_insufficient_output;

    if v_has_insufficient_output then
      raise exception 'No se puede anular el lote porque dejaria productos con stock negativo';
    end if;

    for v_input in
      select * from public.production_batch_inputs where batch_id = v_batch.id
    loop
      insert into public.inventory_movements (
        entity_type,
        entity_id,
        movement_type,
        quantity,
        movement_date,
        reference_type,
        reference_id,
        notes,
        created_by
      )
      values (
        'supply',
        v_input.supply_id,
        'adjustment',
        round(v_input.quantity, 2),
        timezone('utc', now()),
        'production_batch_reversal',
        v_batch.id,
        coalesce(v_reason, 'Anulacion de lote'),
        v_user_id
      );
    end loop;

    for v_output in
      select * from public.production_batch_outputs where batch_id = v_batch.id
    loop
      insert into public.inventory_movements (
        entity_type,
        entity_id,
        movement_type,
        quantity,
        movement_date,
        reference_type,
        reference_id,
        notes,
        created_by
      )
      values (
        'product',
        v_output.product_id,
        'adjustment',
        round(v_output.quantity * -1, 2),
        timezone('utc', now()),
        'production_batch_reversal',
        v_batch.id,
        coalesce(v_reason, 'Anulacion de lote'),
        v_user_id
      );
    end loop;
  end if;

  update public.production_batches
  set
    status = 'cancelled',
    voided_at = timezone('utc', now()),
    voided_by = v_user_id,
    void_reason = v_reason
  where id = v_batch.id
  returning * into v_batch;

  return v_batch;
end;
$$;

revoke execute on function public.require_operating_user() from public, anon;
revoke execute on function public.assert_payment_consistency(public.payment_status, text, date) from public, anon;
revoke execute on function public.current_inventory_stock(public.entity_type, uuid) from public, anon;
revoke execute on function public.upsert_contact(jsonb) from public, anon;
revoke execute on function public.upsert_product(jsonb) from public, anon;
revoke execute on function public.upsert_supply(jsonb) from public, anon;
revoke execute on function public.create_manual_expense(jsonb) from public, anon;
revoke execute on function public.create_sale_order(jsonb) from public, anon;
revoke execute on function public.update_sale_payment_status(jsonb) from public, anon;
revoke execute on function public.register_supply_purchase(jsonb) from public, anon;
revoke execute on function public.create_production_batch(jsonb) from public, anon;
revoke execute on function public.apply_stock_adjustment(jsonb) from public, anon;
revoke execute on function public.reverse_sale_order(jsonb) from public, anon;
revoke execute on function public.reverse_supply_purchase(jsonb) from public, anon;
revoke execute on function public.reverse_production_batch(jsonb) from public, anon;

grant execute on function public.current_inventory_stock(public.entity_type, uuid) to authenticated;
grant execute on function public.upsert_contact(jsonb) to authenticated;
grant execute on function public.upsert_product(jsonb) to authenticated;
grant execute on function public.upsert_supply(jsonb) to authenticated;
grant execute on function public.create_manual_expense(jsonb) to authenticated;
grant execute on function public.create_sale_order(jsonb) to authenticated;
grant execute on function public.update_sale_payment_status(jsonb) to authenticated;
grant execute on function public.register_supply_purchase(jsonb) to authenticated;
grant execute on function public.create_production_batch(jsonb) to authenticated;
grant execute on function public.apply_stock_adjustment(jsonb) to authenticated;
grant execute on function public.reverse_sale_order(jsonb) to authenticated;
grant execute on function public.reverse_supply_purchase(jsonb) to authenticated;
grant execute on function public.reverse_production_batch(jsonb) to authenticated;
