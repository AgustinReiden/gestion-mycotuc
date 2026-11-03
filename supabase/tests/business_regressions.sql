-- Pruebas de regresion de la base (roles, catalogo, precios, stock, costos, cobros, anulaciones,
-- costos solo para admin y stock inicial con costo).
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

-- Intento real de lectura como el rol "authenticated" (lo que hace PostgREST).
-- Devuelve 'allowed', 'denied' o 'skip: ...' cuando el entorno no permite SET ROLE
-- (p. ej. si la suite corre dentro de una funcion SECURITY DEFINER como run_sql).
-- La subtransaccion siempre se revierte, asi que el rol vuelve al original.
create or replace function pg_temp.select_as_authenticated(p_sql text)
returns text
language plpgsql
as $$
begin
  -- el SET ROLE va aparte: dentro de SECURITY DEFINER falla tambien con insufficient_privilege
  begin
    set local role authenticated;
  exception when others then
    return 'skip: ' || sqlerrm;
  end;
  execute p_sql;
  raise exception 'SELECT_OK';
exception
  when insufficient_privilege then
    return 'denied';
  when others then
    if sqlerrm = 'SELECT_OK' then
      return 'allowed';
    end if;
    return 'skip: ' || sqlerrm;
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
  v_s_ajuste uuid;
  v_fresco uuid;
  v_product public.products;
  v_text text;
  v_col record;
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

  -- ---------------------------------------------------------------- costos solo para admin (B2)
  for v_col in
    select * from (values
      ('public.products', 'avg_cost'), ('public.supplies', 'avg_cost'),
      ('public.sales_order_items', 'unit_cost'), ('public.purchase_items', 'unit_cost'),
      ('public.purchase_items', 'line_total'), ('public.production_batches', 'total_cost'),
      ('public.production_batches', 'unit_cost'), ('public.production_batch_inputs', 'unit_cost'),
      ('public.production_batch_outputs', 'unit_cost')
    ) t (tbl, col)
  loop
    perform pg_temp.check_that(not has_column_privilege('authenticated', v_col.tbl, v_col.col, 'select'),
      format('authenticated no lee %s.%s', v_col.tbl, v_col.col)); n := n + 1;
    perform pg_temp.check_that(not has_table_privilege('authenticated', v_col.tbl, 'select'),
      format('authenticated no tiene SELECT de tabla en %s', v_col.tbl));
  end loop;
  perform pg_temp.check_that(has_column_privilege('authenticated', 'public.products', 'name', 'select')
    and has_column_privilege('authenticated', 'public.sales_order_items', 'unit_price', 'select')
    and has_column_privilege('authenticated', 'public.production_batches', 'status', 'select'),
    'authenticated sigue leyendo las columnas que no son costo'); n := n + 1;
  perform pg_temp.check_that(not has_table_privilege('anon', 'public.products', 'select'),
    'anon no lee productos'); n := n + 1;
  perform pg_temp.check_that(not has_function_privilege('anon', 'public.get_product_costs()', 'execute'),
    'anon no ejecuta get_product_costs'); n := n + 1;
  perform pg_temp.check_that(not has_function_privilege('authenticated', 'public.upsert_product_core(jsonb)', 'execute'),
    'authenticated no ejecuta upsert_product_core'); n := n + 1;

  -- intento real como authenticated (se omite si el entorno no deja hacer SET ROLE)
  v_text := pg_temp.select_as_authenticated('select avg_cost from public.products limit 1');
  if v_text like 'skip:%' then
    raise notice 'Intento real como authenticated omitido (%)', v_text;
  else
    perform pg_temp.check_that(v_text = 'denied', 'authenticated no puede select avg_cost (intento real)'); n := n + 1;
    perform pg_temp.check_that(pg_temp.select_as_authenticated('select * from public.sales_order_items limit 1') = 'denied',
      'select * sobre una tabla con costos falla para authenticated'); n := n + 1;
    perform pg_temp.check_that(pg_temp.select_as_authenticated('select id, name, sale_price from public.products limit 1') = 'allowed',
      'authenticated lee columnas sin costo (intento real)'); n := n + 1;
    perform pg_temp.check_that(pg_temp.select_as_authenticated('select * from public.product_inventory_overview limit 1') = 'allowed',
      'la vista de inventario sigue funcionando para authenticated'); n := n + 1;
  end if;

  perform pg_temp.as_user(v_oper);
  perform pg_temp.check_that(pg_temp.fails('select * from public.get_product_costs()'),
    'operador no puede leer costos de productos por funcion'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails('select * from public.get_sale_item_costs()'),
    'operador no puede leer costos de ventas por funcion'); n := n + 1;
  v_product := public.upsert_product(jsonb_build_object('id', v_sal, 'name', 'Sal Test', 'category', 'Sales',
    'unit', 'bolsa', 'salePrice', 500, 'minStock', 0));
  perform pg_temp.check_that(v_product.id = v_sal and v_product.avg_cost is null,
    'upsert_product no devuelve avg_cost al operador'); n := n + 1;

  perform pg_temp.as_user(v_admin);
  select avg_cost into v_val from public.get_product_costs() where id = v_sal;
  perform pg_temp.check_that(v_val = 70, 'admin lee el costo promedio por funcion'); n := n + 1;
  select count(*) into v_cnt from public.get_batch_costs() where id = v_batch.id and total_cost = 700;
  perform pg_temp.check_that(v_cnt = 1, 'admin lee el costo del lote por funcion'); n := n + 1;
  v_product := public.upsert_product(jsonb_build_object('id', v_sal, 'name', 'Sal Test', 'category', 'Sales',
    'unit', 'bolsa', 'salePrice', 500, 'minStock', 0));
  perform pg_temp.check_that(v_product.avg_cost = 70, 'upsert_product devuelve avg_cost al admin'); n := n + 1;

  -- ---------------------------------------------------------------- stock inicial con costo (B6)
  insert into public.supplies (name, unit) values ('Insumo ajuste Test', 'u') returning id into v_s_ajuste;
  perform public.apply_stock_adjustment(jsonb_build_object('entityType', 'supply', 'entityId', v_s_ajuste,
    'quantity', 10, 'notes', 'stock inicial sin costo'));
  select avg_cost into v_val from public.supplies where id = v_s_ajuste;
  perform pg_temp.check_that(v_val = 0, 'ajuste sin costo no fija promedio'); n := n + 1;
  perform public.register_supply_purchase(jsonb_build_object('supplierId', v_supplier, 'items', jsonb_build_array(
    jsonb_build_object('supplyId', v_s_ajuste, 'quantity', 10, 'unitCost', 100))));
  select avg_cost into v_val from public.supplies where id = v_s_ajuste;
  perform pg_temp.check_that(v_val = 100, 'ajuste sin costo no diluye: 10 u sin costo + compra 10 @ 100 -> avg 100'); n := n + 1;
  perform public.apply_stock_adjustment(jsonb_build_object('entityType', 'supply', 'entityId', v_s_ajuste,
    'quantity', 10, 'unitCost', 200, 'notes', 'stock encontrado con factura'));
  select avg_cost into v_val from public.supplies where id = v_s_ajuste;
  perform pg_temp.check_that(v_val = 133.3333, 'ajuste con costo pondera: (20 x 100 + 10 x 200) / 30'); n := n + 1;
  perform public.apply_stock_adjustment(jsonb_build_object('entityType', 'supply', 'entityId', v_s_ajuste,
    'quantity', 5, 'notes', 'sobrante sin costo'));
  select avg_cost into v_val from public.supplies where id = v_s_ajuste;
  perform pg_temp.check_that(v_val = 133.3333, 'ajuste sin costo con promedio vigente no lo cambia'); n := n + 1;
  select count(*) into v_cnt from public.average_cost_changes
  where entity_id = v_s_ajuste and source = 'stock_adjustment' and previous_avg_cost = 100 and new_avg_cost = 133.3333;
  perform pg_temp.check_that(v_cnt = 1, 'el ajuste con costo queda auditado'); n := n + 1;

  insert into public.products (name, category, unit, sale_price) values ('Hongo fresco Test', 'Hongos Frescos', 'kg', 300)
  returning id into v_fresco;
  perform public.apply_stock_adjustment(jsonb_build_object('entityType', 'product', 'entityId', v_fresco,
    'quantity', 10, 'unitCost', 50, 'notes', 'stock inicial'));
  select avg_cost into v_val from public.products where id = v_fresco;
  perform pg_temp.check_that(v_val = 50, 'ajuste con costo fija el promedio del producto'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.apply_stock_adjustment(jsonb_build_object('entityType','product','entityId',%L,'quantity',-1,'unitCost',10,'notes','x')) $q$, v_fresco)),
    'costo unitario en ajuste negativo se rechaza'); n := n + 1;
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.apply_stock_adjustment(jsonb_build_object('entityType','product','entityId',%L,'quantity',1,'unitCost',0,'notes','x')) $q$, v_fresco)),
    'costo unitario cero se rechaza'); n := n + 1;

  -- ---------------------------------------------------------------- correccion manual del promedio
  perform pg_temp.as_user(v_oper);
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.set_average_cost(jsonb_build_object('entityType','product','entityId',%L,'avgCost',10,'reason','x')) $q$, v_fresco)),
    'operador no puede corregir el costo promedio'); n := n + 1;
  perform pg_temp.as_user(v_admin);
  perform pg_temp.check_that(pg_temp.fails(format($q$ select public.set_average_cost(jsonb_build_object('entityType','product','entityId',%L,'avgCost',10,'reason','  ')) $q$, v_fresco)),
    'corregir el costo sin motivo se rechaza'); n := n + 1;
  perform public.set_average_cost(jsonb_build_object('entityType', 'product', 'entityId', v_fresco, 'avgCost', 60, 'reason', 'costo real del proveedor'));
  select avg_cost into v_val from public.products where id = v_fresco;
  select count(*) into v_cnt from public.average_cost_changes
  where entity_id = v_fresco and source = 'manual_correction' and previous_avg_cost = 50 and new_avg_cost = 60;
  perform pg_temp.check_that(v_val = 60 and v_cnt = 1, 'set_average_cost corrige y deja registro'); n := n + 1;

  -- ---------------------------------------------------------------- venta de producto sin costo
  select avg_cost into v_val from public.products where id = v_ext;
  perform pg_temp.check_that(v_val = 0, 'el extracto de prueba no tiene costo cargado'); n := n + 1;
  v_order := public.create_sale_order(jsonb_build_object('contactId', v_client, 'channelId', v_channel, 'items', jsonb_build_array(
    jsonb_build_object('productId', v_ext, 'quantity', 1), jsonb_build_object('productId', v_fresco, 'quantity', 1))));
  select count(*) into v_cnt from public.sales_order_items where sales_order_id = v_order.id and product_id = v_ext and unit_cost is null;
  perform pg_temp.check_that(v_cnt = 1, 'venta de producto sin costo guarda unit_cost null (no 0)'); n := n + 1;
  select unit_cost into v_val from public.sales_order_items where sales_order_id = v_order.id and product_id = v_fresco;
  perform pg_temp.check_that(v_val = 60, 'venta de producto con costo congela el promedio'); n := n + 1;

  raise exception 'PASS: % verificaciones OK (transaccion revertida, no queda nada) [intento real: %]', n, v_text;
end
$$;
