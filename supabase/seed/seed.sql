insert into public.contacts (type, name, phone, email, notes)
values
  ('client', 'Maria Gonzalez', '+54 381 555 0123', 'maria@example.com', 'Compra extractos por WhatsApp'),
  ('client', 'Restaurante Gaia', '+54 381 555 0134', 'gaia@example.com', 'Compra hongos frescos'),
  ('supplier', 'Maderera Norte', '+54 381 555 0145', 'maderera@example.com', 'Proveedor de aserrin y viruta'),
  ('supplier', 'Envases del NOA', '+54 381 555 0156', 'envases@example.com', 'Proveedor de frascos y etiquetas')
on conflict do nothing;

insert into public.products (name, category, unit, sale_price, min_stock, notes)
values
  ('Girgolas Frescas', 'Hongos Frescos', 'kg', 30000, 20, 'Producto estacional'),
  ('Shiitake Fresco', 'Hongos Frescos', 'kg', 40000, 15, 'Venta a restaurantes'),
  ('Extracto Reishi', 'Extractos', 'frasco', 20000, 30, 'Frasco de 50ml'),
  ('Extracto Tremella', 'Extractos', 'frasco', 20000, 30, 'Frasco de 50ml'),
  ('Extracto Cordyceps', 'Extractos', 'frasco', 20000, 30, 'Frasco de 50ml'),
  ('Extracto Melena de Leon', 'Extractos', 'frasco', 20000, 30, 'Frasco de 50ml')
on conflict do nothing;

insert into public.supplies (name, unit, min_stock, notes)
values
  ('Aserrin', 'kg', 200, 'Base para sustrato'),
  ('Viruta de madera', 'kg', 150, 'Mezcla para sustrato'),
  ('Sorgo', 'kg', 100, 'Grano para spawn'),
  ('Frascos 50ml', 'unidades', 100, 'Envases para extractos'),
  ('Etiquetas', 'unidades', 200, 'Etiquetas impresas'),
  ('Bolsas de cultivo', 'unidades', 200, 'Bolsas autoclavables')
on conflict do nothing;

insert into public.inventory_movements (entity_type, entity_id, movement_type, quantity, movement_date, reference_type, notes)
select 'product', id, 'adjustment', stock, current_date::timestamp, 'seed', 'Stock inicial'
from (
  values
    ('Girgolas Frescas', 45.0),
    ('Shiitake Fresco', 28.0),
    ('Extracto Reishi', 80.0),
    ('Extracto Tremella', 65.0),
    ('Extracto Cordyceps', 12.0),
    ('Extracto Melena de Leon', 55.0)
) as seed(name, stock)
join public.products p on p.name = seed.name;

insert into public.inventory_movements (entity_type, entity_id, movement_type, quantity, movement_date, reference_type, notes)
select 'supply', id, 'adjustment', stock, current_date::timestamp, 'seed', 'Stock inicial'
from (
  values
    ('Aserrin', 500.0),
    ('Viruta de madera', 300.0),
    ('Sorgo', 80.0),
    ('Frascos 50ml', 250.0),
    ('Etiquetas', 180.0),
    ('Bolsas de cultivo', 400.0)
) as seed(name, stock)
join public.supplies s on s.name = seed.name;
