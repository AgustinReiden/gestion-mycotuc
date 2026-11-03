-- Limpieza de los datos de prueba cargados en produccion.
--
-- Borra EXACTAMENTE esto (identificado por nombre y relacion, nunca por id fijo):
--   * producto "Extracto Reishi PRUEBA" y su escala de precio (product_price_tiers),
--   * contacto "Cliente PRUEBA",
--   * las ventas de ese cliente (esperada: 1 de $216.000) con sus items y cobros (sale_payments),
--   * los movimientos de inventario del producto y de esas ventas (esperados: 2),
--   * el registro de costos del producto en average_cost_changes, si la tabla existe.
-- No toca canales, categorias de gasto, categorias de producto, perfiles ni usuarios.
--
-- Seguridad:
--   * todo corre en UN bloque DO, que es atomico: si algo falla no queda nada a medias;
--   * aborta si encuentra mas de lo esperado (ver v_expected) o si el producto / cliente de
--     prueba aparece en ventas, combos o lotes que no son los de prueba;
--   * por defecto es DRY RUN: al final lanza una excepcion con los conteos y revierte todo.
--     Para borrar de verdad, cambiar v_dry_run a false y volver a correrlo.
--
-- Triggers: hoy no hay triggers de DELETE en estas tablas (solo de INSERT/UPDATE: precio, categoria,
-- updated_at), y las FK hijas son ON DELETE CASCADE (items, cobros, escalas). Si en el futuro un
-- trigger impidiera el DELETE, se puede desactivar SOLO dentro de esta transaccion con
--   set local session_replication_role = replica;   -- no dispara triggers ni FKs "origin"
-- (requiere rol con permiso, p. ej. postgres en el SQL Editor) y vuelve solo al terminar.
-- Ojo: con replica tampoco se validan FK, por eso este script borra en orden de dependencias.
--
-- Como correrlo: pegar todo en el SQL Editor de Supabase (o psql) y ejecutar.
--   * Dry run:  ERROR: DRY RUN OK: ... (conteos antes/despues; no se borro nada)
--   * Real:     NOTICE con conteos antes/despues y "LIMPIEZA APLICADA".

do $$
declare
  v_dry_run constant boolean := true;  -- <<< cambiar a false para aplicar de verdad

  v_product_name constant text := 'Extracto Reishi PRUEBA';
  v_contact_name constant text := 'Cliente PRUEBA';
  -- maximos esperados; si hay mas, aborta
  v_expected constant jsonb := jsonb_build_object(
    'products', 1, 'contacts', 1, 'sales_orders', 1, 'sales_order_items', 1,
    'sale_payments', 2, 'inventory_movements', 2, 'product_price_tiers', 1, 'average_cost_changes', 0
  );

  v_product_ids uuid[];
  v_contact_ids uuid[];
  v_sale_ids uuid[];
  v_has_cost_log boolean := to_regclass('public.average_cost_changes') is not null;
  v_found jsonb;
  v_before jsonb;
  v_after jsonb;
  v_key text;
  v_cnt bigint;
  v_cost_log_count bigint := 0;
begin
  select coalesce(array_agg(id), '{}') into v_product_ids from public.products where name = v_product_name;
  select coalesce(array_agg(id), '{}') into v_contact_ids from public.contacts where name = v_contact_name;
  select coalesce(array_agg(id), '{}') into v_sale_ids from public.sales_orders where contact_id = any (v_contact_ids);

  if v_has_cost_log then
    execute 'select count(*) from public.average_cost_changes where entity_type = ''product'' and entity_id = any ($1)'
    into v_cost_log_count using v_product_ids;
  end if;

  -- ---------------------------------------------------------------- lo que se va a borrar
  v_found := jsonb_build_object(
    'products', cardinality(v_product_ids),
    'contacts', cardinality(v_contact_ids),
    'sales_orders', cardinality(v_sale_ids),
    'sales_order_items', (select count(*) from public.sales_order_items where sales_order_id = any (v_sale_ids)),
    'sale_payments', (select count(*) from public.sale_payments where sales_order_id = any (v_sale_ids)),
    'inventory_movements', (select count(*) from public.inventory_movements
      where (entity_type = 'product' and entity_id = any (v_product_ids)) or reference_id = any (v_sale_ids)),
    'product_price_tiers', (select count(*) from public.product_price_tiers where product_id = any (v_product_ids)),
    'average_cost_changes', v_cost_log_count
  );
  raise notice 'A borrar: %', v_found;

  if cardinality(v_product_ids) = 0 and cardinality(v_contact_ids) = 0 then
    raise exception 'No hay datos de prueba ("%" / "%"): nada que limpiar', v_product_name, v_contact_name;
  end if;

  for v_key in select jsonb_object_keys(v_expected)
  loop
    if (v_found ->> v_key)::bigint > (v_expected ->> v_key)::bigint then
      raise exception 'ABORTA: % = % y se esperaban como maximo %', v_key, v_found ->> v_key, v_expected ->> v_key;
    elsif (v_found ->> v_key)::bigint < (v_expected ->> v_key)::bigint then
      raise notice 'Aviso: % = % (se esperaban %)', v_key, v_found ->> v_key, v_expected ->> v_key;
    end if;
  end loop;

  -- ---------------------------------------------------------------- nada real puede depender de esto
  select count(*) into v_cnt
  from public.sales_order_items soi
  join public.sales_orders so on so.id = soi.sales_order_id
  where soi.product_id = any (v_product_ids) and not (so.contact_id = any (v_contact_ids));
  if v_cnt > 0 then
    raise exception 'ABORTA: el producto de prueba aparece en % lineas de ventas de otros clientes', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.sales_order_items
  where sales_order_id = any (v_sale_ids) and not (product_id = any (v_product_ids));
  if v_cnt > 0 then
    raise exception 'ABORTA: las ventas de prueba tienen % lineas de otros productos', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.inventory_movements
  where reference_id = any (v_sale_ids) and not (entity_type = 'product' and entity_id = any (v_product_ids));
  if v_cnt > 0 then
    raise exception 'ABORTA: las ventas de prueba movieron stock de % registros de otros productos', v_cnt;
  end if;

  select count(*) into v_cnt from public.product_bundle_items where product_id = any (v_product_ids);
  if v_cnt > 0 then
    raise exception 'ABORTA: el producto de prueba es componente de % combos', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.production_batches pb
  where pb.product_id = any (v_product_ids)
     or exists (select 1 from public.production_batch_outputs o where o.batch_id = pb.id and o.product_id = any (v_product_ids));
  if v_cnt > 0 then
    raise exception 'ABORTA: el producto de prueba tiene % lotes de produccion', v_cnt;
  end if;

  select count(*) into v_cnt from public.purchases where supplier_id = any (v_contact_ids);
  if v_cnt > 0 then
    raise exception 'ABORTA: el contacto de prueba tiene % compras', v_cnt;
  end if;

  -- ---------------------------------------------------------------- conteos antes
  v_before := jsonb_build_object(
    'products', (select count(*) from public.products),
    'contacts', (select count(*) from public.contacts),
    'sales_orders', (select count(*) from public.sales_orders),
    'sales_order_items', (select count(*) from public.sales_order_items),
    'sale_payments', (select count(*) from public.sale_payments),
    'inventory_movements', (select count(*) from public.inventory_movements),
    'product_price_tiers', (select count(*) from public.product_price_tiers),
    'sales_channels', (select count(*) from public.sales_channels),
    'expense_categories', (select count(*) from public.expense_categories),
    'product_categories', (select count(*) from public.product_categories),
    'profiles', (select count(*) from public.profiles),
    'auth_users', (select count(*) from auth.users)
  );
  raise notice 'Antes: %', v_before;

  -- ---------------------------------------------------------------- borrado en orden de dependencias
  delete from public.inventory_movements
  where (entity_type = 'product' and entity_id = any (v_product_ids)) or reference_id = any (v_sale_ids);
  delete from public.sale_payments where sales_order_id = any (v_sale_ids);
  delete from public.sales_order_items where sales_order_id = any (v_sale_ids);
  delete from public.sales_orders where id = any (v_sale_ids);
  delete from public.product_price_tiers where product_id = any (v_product_ids);
  if v_has_cost_log then
    execute 'delete from public.average_cost_changes where entity_type = ''product'' and entity_id = any ($1)'
    using v_product_ids;
  end if;
  delete from public.products where id = any (v_product_ids);
  delete from public.contacts where id = any (v_contact_ids);

  -- ---------------------------------------------------------------- conteos despues
  v_after := jsonb_build_object(
    'products', (select count(*) from public.products),
    'contacts', (select count(*) from public.contacts),
    'sales_orders', (select count(*) from public.sales_orders),
    'sales_order_items', (select count(*) from public.sales_order_items),
    'sale_payments', (select count(*) from public.sale_payments),
    'inventory_movements', (select count(*) from public.inventory_movements),
    'product_price_tiers', (select count(*) from public.product_price_tiers),
    'sales_channels', (select count(*) from public.sales_channels),
    'expense_categories', (select count(*) from public.expense_categories),
    'product_categories', (select count(*) from public.product_categories),
    'profiles', (select count(*) from public.profiles),
    'auth_users', (select count(*) from auth.users)
  );
  raise notice 'Despues: %', v_after;

  -- lo que se conserva no puede haber cambiado
  for v_key in select unnest(array['sales_channels', 'expense_categories', 'product_categories', 'profiles', 'auth_users'])
  loop
    if v_before -> v_key <> v_after -> v_key then
      raise exception 'ABORTA: cambio % (% -> %)', v_key, v_before -> v_key, v_after -> v_key;
    end if;
  end loop;

  if v_dry_run then
    raise exception 'DRY RUN OK: borraria % | antes % | despues % (no se borro nada)', v_found, v_before, v_after;
  end if;

  raise notice 'LIMPIEZA APLICADA: %', v_found;
end;
$$;
