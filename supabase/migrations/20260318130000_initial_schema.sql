create extension if not exists pgcrypto;

create type public.contact_type as enum ('client', 'supplier');
create type public.payment_status as enum ('pending', 'partial', 'paid');
create type public.expense_source as enum ('manual', 'purchase');
create type public.entity_type as enum ('product', 'supply');
create type public.inventory_movement_type as enum ('purchase_in', 'sale_out', 'production_in', 'production_out', 'adjustment');
create type public.batch_status as enum ('draft', 'active', 'completed', 'cancelled');

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  type public.contact_type not null,
  name text not null,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  unit text not null,
  sale_price numeric(14, 2) not null default 0,
  min_stock numeric(14, 2) not null default 0,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.supplies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  min_stock numeric(14, 2) not null default 0,
  notes text,
  last_purchase_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id),
  channel_id uuid not null references public.sales_channels (id),
  sale_date date not null default current_date,
  payment_status public.payment_status not null default 'pending',
  payment_method text,
  paid_at date,
  notes text,
  subtotal_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14, 2) not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.contacts (id),
  purchase_date date not null default current_date,
  notes text,
  total_amount numeric(14, 2) not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  supply_id uuid not null references public.supplies (id),
  quantity numeric(14, 2) not null,
  unit_cost numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  concept text not null,
  category_id uuid not null references public.expense_categories (id),
  amount numeric(14, 2) not null,
  source public.expense_source not null default 'manual',
  notes text,
  linked_purchase_id uuid unique references public.purchases (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  status public.batch_status not null default 'draft',
  started_at date not null default current_date,
  completed_at date,
  expected_qty numeric(14, 2),
  actual_qty numeric(14, 2),
  notes text,
  inventory_posted_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.production_batch_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches (id) on delete cascade,
  supply_id uuid not null references public.supplies (id),
  quantity numeric(14, 2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.production_batch_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14, 2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  entity_type public.entity_type not null,
  entity_id uuid not null,
  movement_type public.inventory_movement_type not null,
  quantity numeric(14, 2) not null,
  movement_date timestamptz not null default timezone('utc', now()),
  reference_type text not null,
  reference_id uuid,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

create index sales_orders_sale_date_idx on public.sales_orders (sale_date desc);
create index expenses_expense_date_idx on public.expenses (expense_date desc);
create index purchases_purchase_date_idx on public.purchases (purchase_date desc);
create index production_batches_started_at_idx on public.production_batches (started_at desc);
create index inventory_movements_lookup_idx on public.inventory_movements (entity_type, entity_id, movement_date desc);

create or replace function public.resolve_profile_name(
  p_email text,
  p_meta jsonb,
  p_existing text default null
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(p_meta ->> 'full_name', ''),
    nullif(p_meta ->> 'name', ''),
    nullif(p_existing, ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Usuario'
  );
$$;

create or replace function public.sync_profile_from_auth_user_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    public.resolve_profile_name(new.email, new.raw_user_meta_data)
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = public.resolve_profile_name(excluded.email, new.raw_user_meta_data, profiles.full_name),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.backfill_profiles_from_auth_users()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer := 0;
begin
  with synced as (
    insert into public.profiles (id, email, full_name)
    select
      u.id,
      u.email,
      public.resolve_profile_name(u.email, u.raw_user_meta_data)
    from auth.users u
    on conflict (id) do update
    set
      email = excluded.email,
      full_name = public.resolve_profile_name(
        excluded.email,
        coalesce((select raw_user_meta_data from auth.users where id = excluded.id), '{}'::jsonb),
        profiles.full_name
      ),
      updated_at = timezone('utc', now())
    returning 1
  )
  select count(*) into v_count from synced;

  return v_count;
end;
$$;

create or replace function public.ensure_current_user_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user auth.users;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user available';
  end if;

  select *
  into v_user
  from auth.users
  where id = auth.uid();

  if not found then
    raise exception 'Authenticated user not found in auth.users';
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    v_user.id,
    v_user.email,
    public.resolve_profile_name(v_user.email, v_user.raw_user_meta_data)
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = public.resolve_profile_name(excluded.email, v_user.raw_user_meta_data, profiles.full_name),
    updated_at = timezone('utc', now())
  returning * into v_profile;

  return v_profile;
end;
$$;

create trigger handle_profile_updated_at
before update on public.profiles
for each row execute procedure public.set_row_updated_at();

create trigger handle_sales_channels_updated_at
before update on public.sales_channels
for each row execute procedure public.set_row_updated_at();

create trigger handle_expense_categories_updated_at
before update on public.expense_categories
for each row execute procedure public.set_row_updated_at();

create trigger handle_contacts_updated_at
before update on public.contacts
for each row execute procedure public.set_row_updated_at();

create trigger handle_products_updated_at
before update on public.products
for each row execute procedure public.set_row_updated_at();

create trigger handle_supplies_updated_at
before update on public.supplies
for each row execute procedure public.set_row_updated_at();

create trigger handle_sales_orders_updated_at
before update on public.sales_orders
for each row execute procedure public.set_row_updated_at();

create trigger handle_purchases_updated_at
before update on public.purchases
for each row execute procedure public.set_row_updated_at();

create trigger handle_expenses_updated_at
before update on public.expenses
for each row execute procedure public.set_row_updated_at();

create trigger handle_production_batches_updated_at
before update on public.production_batches
for each row execute procedure public.set_row_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.sync_profile_from_auth_user_row();

create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute procedure public.sync_profile_from_auth_user_row();

alter table public.profiles enable row level security;
alter table public.sales_channels enable row level security;
alter table public.expense_categories enable row level security;
alter table public.contacts enable row level security;
alter table public.products enable row level security;
alter table public.supplies enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.expenses enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_inputs enable row level security;
alter table public.production_batch_outputs enable row level security;
alter table public.inventory_movements enable row level security;

create policy "profiles select own" on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles insert own" on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles update own" on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "authenticated full access sales channels" on public.sales_channels
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access expense categories" on public.expense_categories
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access contacts" on public.contacts
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access products" on public.products
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access supplies" on public.supplies
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access sales orders" on public.sales_orders
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access sales order items" on public.sales_order_items
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access purchases" on public.purchases
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access purchase items" on public.purchase_items
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access expenses" on public.expenses
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access production batches" on public.production_batches
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access production batch inputs" on public.production_batch_inputs
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access production batch outputs" on public.production_batch_outputs
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access inventory movements" on public.inventory_movements
for all
to authenticated
using (true)
with check (true);

create or replace view public.product_inventory_overview as
select
  p.id,
  p.name,
  p.category,
  p.unit,
  p.sale_price,
  p.min_stock,
  p.notes,
  p.is_active,
  p.created_at,
  coalesce(sum(im.quantity), 0)::numeric(14, 2) as current_stock
from public.products p
left join public.inventory_movements im
  on im.entity_type = 'product'
 and im.entity_id = p.id
group by p.id;

create or replace view public.supply_inventory_overview as
select
  s.id,
  s.name,
  s.unit,
  s.min_stock,
  s.notes,
  s.last_purchase_at,
  s.is_active,
  s.created_at,
  coalesce(sum(im.quantity), 0)::numeric(14, 2) as current_stock
from public.supplies s
left join public.inventory_movements im
  on im.entity_type = 'supply'
 and im.entity_id = s.id
group by s.id;

create or replace function public.create_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security invoker
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
  v_sale_date date := coalesce((payload ->> 'saleDate')::date, current_date);
  v_created_by uuid := auth.uid();
begin
  if payload is null then
    raise exception 'Payload requerido';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'La venta debe incluir al menos un item';
  end if;

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
    coalesce((payload ->> 'paymentStatus')::public.payment_status, 'pending'),
    nullif(payload ->> 'paymentMethod', ''),
    nullif(payload ->> 'paidAt', '')::date,
    nullif(payload ->> 'notes', ''),
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

    select coalesce(current_stock, 0)
    into v_available
    from public.product_inventory_overview
    where id = v_product_id;

    if v_available is null then
      raise exception 'Producto inexistente';
    end if;

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
      nullif(payload ->> 'notes', ''),
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

create or replace function public.register_supply_purchase(payload jsonb)
returns public.purchases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_purchase public.purchases;
  v_item jsonb;
  v_total numeric(14, 2) := 0;
  v_purchase_id uuid := gen_random_uuid();
  v_purchase_date date := coalesce((payload ->> 'purchaseDate')::date, current_date);
  v_supply_id uuid;
  v_quantity numeric(14, 2);
  v_unit_cost numeric(14, 2);
  v_created_by uuid := auth.uid();
  v_expense_category_id uuid;
begin
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'La compra debe incluir al menos un item';
  end if;

  select id
  into v_expense_category_id
  from public.expense_categories
  where lower(name) = 'insumos'
  limit 1;

  if v_expense_category_id is null then
    raise exception 'No existe la categoria de gasto Insumos';
  end if;

  insert into public.purchases (
    id,
    supplier_id,
    purchase_date,
    notes,
    created_by
  )
  values (
    v_purchase_id,
    nullif(payload ->> 'supplierId', '')::uuid,
    v_purchase_date,
    nullif(payload ->> 'notes', ''),
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
      nullif(payload ->> 'notes', ''),
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
    nullif(payload ->> 'notes', ''),
    v_purchase_id,
    v_created_by
  );

  return v_purchase;
end;
$$;

create or replace function public.create_production_batch(payload jsonb)
returns public.production_batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.production_batches;
  v_existing public.production_batches;
  v_batch_id uuid := coalesce(nullif(payload ->> 'id', '')::uuid, gen_random_uuid());
  v_input jsonb;
  v_output jsonb;
  v_started_at date := coalesce((payload ->> 'startedAt')::date, current_date);
  v_completed_at date := nullif(payload ->> 'completedAt', '')::date;
  v_created_by uuid := auth.uid();
begin
  if exists(select 1 from public.production_batches where id = v_batch_id) then
    select *
    into v_existing
    from public.production_batches
    where id = v_batch_id;

    if v_existing.inventory_posted_at is not null then
      raise exception 'Los lotes cerrados no pueden modificarse';
    end if;

    update public.production_batches
    set
      product_id = (payload ->> 'productId')::uuid,
      status = coalesce((payload ->> 'status')::public.batch_status, 'draft'),
      started_at = v_started_at,
      completed_at = v_completed_at,
      expected_qty = nullif(payload ->> 'expectedQty', '')::numeric,
      actual_qty = nullif(payload ->> 'actualQty', '')::numeric,
      notes = nullif(payload ->> 'notes', '')
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
      coalesce((payload ->> 'status')::public.batch_status, 'draft'),
      v_started_at,
      v_completed_at,
      nullif(payload ->> 'expectedQty', '')::numeric,
      nullif(payload ->> 'actualQty', '')::numeric,
      nullif(payload ->> 'notes', ''),
      v_created_by
    )
    returning * into v_batch;
  end if;

  if jsonb_typeof(payload -> 'inputs') = 'array' then
    for v_input in select * from jsonb_array_elements(payload -> 'inputs')
    loop
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
security invoker
set search_path = public
as $$
declare
  v_movement public.inventory_movements;
  v_entity_type public.entity_type := (payload ->> 'entityType')::public.entity_type;
  v_entity_id uuid := (payload ->> 'entityId')::uuid;
  v_quantity numeric(14, 2) := (payload ->> 'quantity')::numeric;
  v_created_by uuid := auth.uid();
begin
  if v_quantity = 0 then
    raise exception 'La variacion no puede ser cero';
  end if;

  if v_entity_type = 'product' and not exists(select 1 from public.products where id = v_entity_id) then
    raise exception 'Producto inexistente';
  end if;

  if v_entity_type = 'supply' and not exists(select 1 from public.supplies where id = v_entity_id) then
    raise exception 'Insumo inexistente';
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
    nullif(payload ->> 'notes', ''),
    v_created_by
  )
  returning * into v_movement;

  return v_movement;
end;
$$;

insert into public.sales_channels (name)
values
  ('WhatsApp'),
  ('Instagram'),
  ('Tienda Online'),
  ('Farmacia'),
  ('Feria'),
  ('Gimnasio'),
  ('Terapeuta')
on conflict (name) do nothing;

insert into public.expense_categories (name)
values
  ('Insumos'),
  ('Servicios'),
  ('Packaging'),
  ('Alquiler'),
  ('Sueldos'),
  ('Transporte'),
  ('Marketing'),
  ('Otros')
on conflict (name) do nothing;

select public.backfill_profiles_from_auth_users();
