-- Pruebas de regresion de la base (roles, catalogo, precios, stock, costos, cobros, anulaciones).
--
-- Como correrlo: en el SQL Editor de Supabase (o psql) de una base con TODAS las migraciones
-- aplicadas. No deja datos: todo ocurre en una sola transaccion que termina con una excepcion
-- a proposito.
--   * Si pasa todo:   ERROR: PASS: N verificaciones OK (transaccion revertida, no queda nada)
--   * Si algo falla:  ERROR: FAIL: <descripcion de la verificacion>
--
-- Crea usuarios y datos de prueba propios; no depende del seed ni de los usuarios reales.

create or replace function pg_temp.check_that(p_ok boolean, p_msg text)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'FAIL: %', p_msg;
  end if;
end;
$$;

-- true si la sentencia falla (la sentencia corre en una subtransaccion)
create or replace function pg_temp.fails(p_sql text)
returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

create or replace function pg_temp.as_user(p_user uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

do $$
declare
  n integer := 0;
  v_admin uuid := gen_random_uuid();
  v_oper uuid := gen_random_uuid();
  v_client uuid;
  v_supplier uuid;
  v_channel uuid;
  v_ext uuid;
  v_sal uuid;
  v_s_hongo uuid;
  v_s_frasco uuid;
  v_bundle public.product_bundles;
  v_purchase public.purchases;
  v_batch public.production_batches;
  v_order public.sales_orders;
  v_order2 public.sales_orders;
  v_val numeric;
  v_val2 numeric;
  v_cnt integer;
begin
  -- ---------------------------------------------------------------- roles
  insert into auth.users (id, email, aud, role) values (v_admin, 'admin-test@example.com', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role) values (v_oper, 'oper-test@example.com', 'authenticated', 'authenticated');
  -- el rol admin lo recibe el primer perfil de la base; fuerzo el escenario para que no dependa de datos reales
  update public.profiles set role = 'admin' where id = v_admin;
  update public.profiles set role = 'operator' where id = v_oper;

  perform pg_temp.as_user(v_admin);
  perform pg_temp.check_that(public.is_admin(), 'admin es admin'); n := n + 1;
  perform pg_temp.as_user(v_oper);
  perform pg_temp.check_that(not public.is_admin(), 'operador no es admin'); n := n + 1;
  perform pg_temp.check_that(not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'),
    'un usuario no puede cambiar su propio rol'); n := n + 1;

  -- ---------------------------------------------------------------- seguridad de catalogo
  perform pg_temp.check_that(not has_table_privilege('anon', 'public.product_inventory_overview', 'select'),
    'anon no lee vista de inventario de productos'); n := n + 1;
  perform pg_temp.check_that(not has_table_privilege('anon', 'public.inventory_movement_details', 'select'),
    'anon no lee detalle de movimientos'); n := n + 1;
  perform pg_temp.check_that(not has_function_privilege('anon', 'public.create_sale_order(jsonb)', 'execute'),
    'anon no ejecuta create_sale_order'); n := n + 1;
  perform pg_temp.check_that(not has_function_privilege('authenticated', 'public.create_sale_order_core(jsonb)', 'execute'),
    'authenticated no ejecuta la implementacion interna de ventas'); n := n + 1;
  perform pg_temp.check_that(not has_function_privilege('authenticated', 'public.backfill_profiles_from_auth_users()', 'execute'),
    'authenticated no ejecuta backfill de perfiles'); n := n + 1;

  -- ---------------------------------------------------------------- datos base (como admin)
  perform pg_temp.as_user(v_admin);
  insert into public.contacts (type, name) values ('client', 'Cliente Test') returning id into v_client;
  insert into public.contacts (type, name) values ('supplier', 'Proveedor Test') returning id into v_supplier;
  select id into v_channel from public.sales_channels where is_active order by name limit 1;
  perform pg_temp.check_that(v_channel is not null, 'existe al menos un canal de venta activo'); n := n + 1;

  insert into public.products (name, category, unit, sale_price) values ('Extracto Test', 'Extractos', 'frasco', 1000) returning id into v_ext;
  insert into public.products (name, category, unit, sale_price) values ('Sal Test', 'Sales', 'bolsa', 500) returning id into v_sal;
  perform pg_temp.check_that(pg_temp.fails($q$ insert into public.products (name, category, unit) values ('X', 'Inventada', 'u') $q$),
    'una categoria inexistente se rechaza'); n := n + 1;

  insert into public.inventory_movements (entity_type, entity_id, movement_type, quantity, reference_type)
  values ('product', v_ext, 'adjustment', 100, 'test'), ('product', v_sal, 'adjustment', 100, 'test');

  -- ---------------------------------------------------------------- permisos de admin
  perform pg_temp.as_user(v_oper);
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.save_price_tiers(jsonb_build_object('productId', %L, 'tiers', '[]'::jsonb)) $q$, v_ext)),
    'operador no puede guardar escalas'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.upsert_bundle(jsonb_build_object('name','Combo X','salePrice',100,'items',jsonb_build_array(jsonb_build_object('productId',%L,'quantity',1)))) $q$, v_ext)),
    'operador no puede crear combos'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ update public.products set sale_price = 1 where id = %L $q$, v_ext)),
    'operador no puede cambiar el precio base'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.apply_stock_adjustment(jsonb_build_object('entityType','product','entityId',%L,'quantity',1,'notes','x')) $q$, v_ext)),
    'operador no puede ajustar stock'); n := n + 1;

  -- ---------------------------------------------------------------- escalas y combos
  perform pg_temp.as_user(v_admin);
  perform public.save_price_tiers(jsonb_build_object('productId', v_ext, 'tiers', jsonb_build_array(
    jsonb_build_object('minQty', 10, 'unitPrice', 900), jsonb_build_object('minQty', 50, 'unitPrice', 800))));
  perform pg_temp.check_that(public.resolve_product_price(v_ext, 5) = 1000, 'bajo la primera escala rige el precio base'); n := n + 1;
  perform pg_temp.check_that(public.resolve_product_price(v_ext, 12) = 900, 'desde 10 rige 900'); n := n + 1;
  perform pg_temp.check_that(public.resolve_product_price(v_ext, 50) = 800, 'desde 50 rige 800'); n := n + 1;

  v_bundle := public.upsert_bundle(jsonb_build_object('name', 'Combo Test', 'salePrice', 1200, 'items', jsonb_build_array(
    jsonb_build_object('productId', v_ext, 'quantity', 1), jsonb_build_object('productId', v_sal, 'quantity', 2))));

  -- ---------------------------------------------------------------- venta: escala + combo (admin)
  v_order := public.create_sale_order(jsonb_build_object('contactId', v_client, 'channelId', v_channel, 'items', jsonb_build_array(
    jsonb_build_object('productId', v_ext, 'quantity', 12), jsonb_build_object('bundleId', v_bundle.id, 'quantity', 2))));
  perform pg_temp.check_that(v_order.total_amount = 13200, 'total = 12 x 900 + 2 combos x 1200'); n := n + 1;
  select count(*), sum(line_total) into v_cnt, v_val from public.sales_order_items where sales_order_id = v_order.id;
  perform pg_temp.check_that(v_cnt = 3 and v_val = 13200, 'el combo se reparte en lineas que suman el total'); n := n + 1;
  perform pg_temp.check_that(public.current_inventory_stock('product', v_ext) = 86, 'stock del extracto descuenta directo y componente'); n := n + 1;
  perform pg_temp.check_that(public.current_inventory_stock('product', v_sal) = 96, 'stock de la sal descuenta el componente'); n := n + 1;

  -- ---------------------------------------------------------------- venta: reglas del operador
  perform pg_temp.as_user(v_oper);
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.create_sale_order(jsonb_build_object('contactId',%L,'channelId',%L,'items',jsonb_build_array(jsonb_build_object('productId',%L,'quantity',1,'unitPrice',10)))) $q$, v_client, v_channel, v_ext)),
    'operador no puede vender mas barato que la lista'); n := n + 1;
  v_order2 := public.create_sale_order(jsonb_build_object('contactId', v_client, 'channelId', v_channel, 'items', jsonb_build_array(
    jsonb_build_object('productId', v_ext, 'quantity', 50))));
  perform pg_temp.check_that(v_order2.total_amount = 40000, 'operador vende 50 al precio de escala');  n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.create_sale_order(jsonb_build_object('contactId',%L,'channelId',%L,'items',jsonb_build_array(jsonb_build_object('bundleId',%L,'quantity',500)))) $q$, v_client, v_channel, v_bundle.id)),
    'stock insuficiente por componentes de combo se rechaza'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.reverse_sale_order(jsonb_build_object('saleOrderId',%L,'reason','prueba')) $q$, v_order.id)),
    'operador no puede anular ventas'); n := n + 1;

  -- ---------------------------------------------------------------- compras y costo promedio
  perform pg_temp.as_user(v_admin);
  insert into public.supplies (name, unit) values ('Hongo seco Test', 'kg') returning id into v_s_hongo;
  insert into public.supplies (name, unit) values ('Frasco Test', 'u') returning id into v_s_frasco;
  v_purchase := public.register_supply_purchase(jsonb_build_object('supplierId', v_supplier, 'items', jsonb_build_array(
    jsonb_build_object('supplyId', v_s_hongo, 'quantity', 10, 'unitCost', 100),
    jsonb_build_object('supplyId', v_s_frasco, 'quantity', 20, 'unitCost', 10))));
  perform public.register_supply_purchase(jsonb_build_object('supplierId', v_supplier, 'items', jsonb_build_array(
    jsonb_build_object('supplyId', v_s_hongo, 'quantity', 10, 'unitCost', 200))));
  select avg_cost into v_val from public.supplies where id = v_s_hongo;
  perform pg_temp.check_that(v_val = 150, 'costo promedio ponderado del insumo = 150'); n := n + 1;

  -- ---------------------------------------------------------------- produccion y costo de lote
  v_batch := public.create_production_batch(jsonb_build_object('productId', v_sal, 'status', 'completed',
    'startedAt', '2026-11-01', 'completedAt', '2026-11-02',
    'inputs', jsonb_build_array(jsonb_build_object('supplyId', v_s_hongo, 'quantity', 4), jsonb_build_object('supplyId', v_s_frasco, 'quantity', 10)),
    'outputs', jsonb_build_array(jsonb_build_object('productId', v_sal, 'quantity', 10))));
  perform pg_temp.check_that(v_batch.total_cost = 700 and v_batch.unit_cost = 70, 'costo de lote 700 (70 por unidad)'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.create_production_batch(jsonb_build_object('productId',%L,'status','completed','startedAt','2026-11-01','inputs','[]'::jsonb,'outputs','[]'::jsonb)) $q$, v_sal)),
    'lote completado sin cierre, insumos y salidas se rechaza'); n := n + 1;

  -- ---------------------------------------------------------------- cobros parciales y costo congelado
  v_order := public.create_sale_order(jsonb_build_object('contactId', v_client, 'channelId', v_channel,
    'paymentStatus', 'partial', 'paymentMethod', 'efectivo', 'paidAt', '2026-11-03', 'amountPaid', 20,
    'items', jsonb_build_array(jsonb_build_object('productId', v_sal, 'quantity', 1))));
  select unit_cost into v_val from public.sales_order_items where sales_order_id = v_order.id;
  perform pg_temp.check_that(v_order.amount_paid = 20 and v_order.payment_status = 'partial', 'venta parcial registra el cobro inicial'); n := n + 1;
  perform pg_temp.check_that(v_val is not null, 'la linea de venta congela el costo unitario'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.create_sale_order(jsonb_build_object('contactId',%L,'channelId',%L,'paymentStatus','partial','paymentMethod','e','paidAt','2026-11-03','items',jsonb_build_array(jsonb_build_object('productId',%L,'quantity',1)))) $q$, v_client, v_channel, v_sal)),
    'venta parcial sin monto se rechaza'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.update_sale_payment_status(jsonb_build_object('saleOrderId',%L,'paymentStatus','partial','paymentMethod','x','paidAt','2026-11-04','amount',100000)) $q$, v_order.id)),
    'un cobro mayor al saldo se rechaza'); n := n + 1;
  v_order := public.update_sale_payment_status(jsonb_build_object('saleOrderId', v_order.id, 'paymentStatus', 'paid', 'paymentMethod', 'transf', 'paidAt', '2026-11-05'));
  select count(*), sum(amount) into v_cnt, v_val2 from public.sale_payments where sales_order_id = v_order.id;
  perform pg_temp.check_that(v_order.payment_status = 'paid' and v_order.amount_paid = v_order.total_amount, 'pagar saldo deja la venta saldada'); n := n + 1;
  perform pg_temp.check_that(v_cnt = 2 and v_val2 = v_order.total_amount, 'los cobros suman el total de la venta'); n := n + 1;
  perform pg_temp.as_user(v_oper);
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.update_sale_payment_status(jsonb_build_object('saleOrderId',%L,'paymentStatus','pending')) $q$, v_order.id)),
    'operador no puede volver una venta a pendiente'); n := n + 1;

  -- ---------------------------------------------------------------- anulaciones y ajustes (admin)
  perform pg_temp.as_user(v_admin);
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.reverse_sale_order(jsonb_build_object('saleOrderId',%L,'reason','')) $q$, v_order2.id)),
    'anular sin motivo se rechaza'); n := n + 1;
  perform public.reverse_sale_order(jsonb_build_object('saleOrderId', v_order2.id, 'reason', 'prueba'));
  perform pg_temp.check_that(public.current_inventory_stock('product', v_ext) = 86, 'anular la venta de 50 devuelve el stock'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.reverse_sale_order(jsonb_build_object('saleOrderId',%L,'reason','otra vez')) $q$, v_order2.id)),
    'no se puede anular dos veces'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.apply_stock_adjustment(jsonb_build_object('entityType','product','entityId',%L,'quantity',-100000,'notes','x')) $q$, v_ext)),
    'un ajuste no puede dejar stock negativo'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.reverse_supply_purchase(jsonb_build_object('purchaseId',%L,'reason','x1')) $q$, v_purchase.id)),
    'no se anula una compra cuyo insumo ya se consumio'); n := n + 1;

  raise exception 'PASS: % verificaciones OK (transaccion revertida, no queda nada)', n;
end
$$;
