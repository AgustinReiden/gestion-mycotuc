-- Historial de cobros que no se borra (I1, I2) y datos maestros que solo cambia un admin (I14).
--
-- I2. Volver una venta a "pendiente" ya no borra sus cobros: los marca anulados
--     (voided_at / voided_by / void_reason = 'Venta vuelta a pendiente') y deja amount_paid en 0
--     como antes. Todo lo que suma cobros cuenta solo los activos (voided_at is null).
-- I1. Anular una venta marca anulados sus cobros activos con void_reason
--     'Devuelto al anular la venta' (el dinero se le devolvio al cliente), con la misma fecha y
--     usuario que la anulacion de la venta. El stock vuelve igual que antes. La fila de la venta
--     conserva payment_status / amount_paid como foto de lo que se habia cobrado.
-- I14. Al editar un producto, solo un admin puede cambiar unidad, categoria o el flag activo.
--      Al editar un insumo, solo un admin puede cambiar unidad o el flag activo. Crear sigue
--      permitido para operadores.
--
-- Compatibilidad: la migracion es aditiva. Las columnas nuevas son nulables, las RPC mantienen
-- nombre, parametros y tipo de retorno, y sale_payments no tiene GRANT por columna (las columnas
-- nuevas quedan legibles para authenticated como el resto de la tabla).

-- ---------------------------------------------------------------- I1/I2: cobros anulados
alter table public.sale_payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users (id),
  add column if not exists void_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_payments'::regclass
      and conname = 'sale_payments_void_consistency'
  ) then
    alter table public.sale_payments
      add constraint sale_payments_void_consistency check (
        (voided_at is null and voided_by is null and void_reason is null)
        or (voided_at is not null and void_reason is not null and length(trim(void_reason)) > 0)
      );
  end if;
end;
$$;

-- Cobros activos por fecha (tablero: "Cobros registrados este mes").
create index if not exists sale_payments_active_paid_at_idx
  on public.sale_payments (paid_at)
  where voided_at is null;

-- Cobros: 'paid' salda el saldo, 'partial' registra un cobro por "amount",
-- 'pending' (admin) anula los cobros activos (ya no los borra).
-- Definicion previa: 20261103160000_costs_margins_payments.sql. Unico cambio: el DELETE pasa a
-- UPDATE ... SET voided_at/voided_by/void_reason sobre los cobros activos.
create or replace function public.update_sale_payment_status(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders;
  v_user_id uuid;
  v_status public.payment_status := (payload ->> 'paymentStatus')::public.payment_status;
  v_method text := nullif(trim(payload ->> 'paymentMethod'), '');
  v_paid_at date := nullif(payload ->> 'paidAt', '')::date;
  v_amount numeric(14, 2) := nullif(payload ->> 'amount', '')::numeric;
  v_balance numeric(14, 2);
begin
  v_user_id := public.require_operating_user();
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

  -- amount_paid es siempre la suma de los cobros activos (se mantiene en cada rama).
  v_balance := v_order.total_amount - v_order.amount_paid;

  if v_status = 'pending' then
    perform public.require_admin();

    update public.sale_payments
    set
      voided_at = timezone('utc', now()),
      voided_by = v_user_id,
      void_reason = 'Venta vuelta a pendiente'
    where sales_order_id = v_order.id
      and voided_at is null;

    update public.sales_orders
    set payment_status = 'pending', payment_method = null, paid_at = null, amount_paid = 0
    where id = v_order.id
    returning * into v_order;
  elsif v_status = 'paid' then
    if v_balance > 0 then
      insert into public.sale_payments (sales_order_id, amount, payment_method, paid_at, created_by)
      values (v_order.id, v_balance, v_method, v_paid_at, v_user_id);
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
    values (v_order.id, v_amount, v_method, v_paid_at, v_user_id);

    update public.sales_orders
    set payment_status = 'partial', payment_method = v_method, paid_at = v_paid_at,
        amount_paid = amount_paid + v_amount
    where id = v_order.id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

-- Anular venta (admin, con motivo). Definicion previa del envoltorio:
-- 20261103120000_security_roles_and_views.sql (la implementacion reverse_sale_order_impl, de
-- 20260427120000_strict_business_processes.sql, no cambia: bloquea la venta FOR UPDATE, bloquea
-- los productos en orden de id, devuelve el stock y marca la venta anulada).
-- Cambio: despues de anular, los cobros activos quedan anulados como "devueltos al cliente".
create or replace function public.reverse_sale_order(payload jsonb)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders;
begin
  perform public.require_admin();
  if nullif(trim(payload ->> 'reason'), '') is null then
    raise exception 'El motivo de la anulacion es obligatorio';
  end if;

  v_order := public.reverse_sale_order_impl(payload);

  -- La venta sigue bloqueada (FOR UPDATE en la implementacion) hasta el fin de la transaccion:
  -- update_sale_payment_status no puede agregar un cobro en el medio.
  update public.sale_payments
  set
    voided_at = v_order.voided_at,
    voided_by = v_order.voided_by,
    void_reason = 'Devuelto al anular la venta'
  where sales_order_id = v_order.id
    and voided_at is null;

  return v_order;
end;
$$;

revoke execute on function public.update_sale_payment_status(jsonb) from public, anon;
revoke execute on function public.reverse_sale_order(jsonb) from public, anon;
grant execute on function public.update_sale_payment_status(jsonb) to authenticated;
grant execute on function public.reverse_sale_order(jsonb) to authenticated;

-- ---------------------------------------------------------------- I14: datos maestros
-- Igual que assert_admin_for_price_change (20261103150000): un trigger cubre upsert_product /
-- upsert_supply y cualquier otro camino que actualice la fila. Solo mira UPDATE: crear sigue
-- permitido para operadores. Las funciones internas que tocan solo avg_cost o last_purchase_at
-- no disparan el trigger (es "update of" columnas puntuales).
create or replace function public.assert_admin_for_product_master_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.unit is distinct from old.unit
    or new.category is distinct from old.category
    or new.is_active is distinct from old.is_active
  ) and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar la unidad, la categoría o desactivar un producto';
  end if;
  return new;
end;
$$;

create or replace function public.assert_admin_for_supply_master_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.unit is distinct from old.unit
    or new.is_active is distinct from old.is_active
  ) and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar la unidad o desactivar un insumo';
  end if;
  return new;
end;
$$;

revoke execute on function public.assert_admin_for_product_master_change() from public, anon, authenticated;
revoke execute on function public.assert_admin_for_supply_master_change() from public, anon, authenticated;

drop trigger if exists products_admin_master_change on public.products;
create trigger products_admin_master_change
before update of unit, category, is_active on public.products
for each row execute procedure public.assert_admin_for_product_master_change();

drop trigger if exists supplies_admin_master_change on public.supplies;
create trigger supplies_admin_master_change
before update of unit, is_active on public.supplies
for each row execute procedure public.assert_admin_for_supply_master_change();
