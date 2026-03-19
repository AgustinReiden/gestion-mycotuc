create or replace view public.inventory_movement_details as
select
  im.id,
  im.entity_type,
  im.entity_id,
  coalesce(p.name, s.name) as entity_name,
  coalesce(p.unit, s.unit) as entity_unit,
  im.movement_type,
  im.quantity,
  im.movement_date,
  im.reference_type,
  im.reference_id,
  im.notes,
  im.created_at,
  pr.full_name as created_by_name
from public.inventory_movements im
left join public.products p
  on im.entity_type = 'product'
 and p.id = im.entity_id
left join public.supplies s
  on im.entity_type = 'supply'
 and s.id = im.entity_id
left join public.profiles pr
  on pr.id = im.created_by;

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
  v_has_insufficient_input boolean;
begin
  if payload is null then
    raise exception 'Payload requerido';
  end if;

  if (payload ->> 'productId') is null then
    raise exception 'El lote debe tener un producto objetivo';
  end if;

  if not exists(select 1 from public.products where id = (payload ->> 'productId')::uuid) then
    raise exception 'Producto inexistente';
  end if;

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
      if (v_input ->> 'quantity')::numeric <= 0 then
        raise exception 'Cada insumo del lote debe tener cantidad mayor a cero';
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
    if not exists(select 1 from public.production_batch_outputs where batch_id = v_batch_id) then
      raise exception 'No puedes completar un lote sin salidas registradas';
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
      left join public.supply_inventory_overview sio
        on sio.id = required_inputs.supply_id
      where coalesce(sio.current_stock, 0) < required_inputs.required_quantity
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
