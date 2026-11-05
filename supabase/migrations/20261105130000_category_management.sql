-- Categorias de producto editables desde el sistema + categoria "Hongos Secos".

insert into public.product_categories (name)
values ('Hongos Secos')
on conflict (name) do nothing;

create unique index if not exists product_categories_name_lower_key
  on public.product_categories (lower(name));

-- Alta, edicion (nombre / activa) de una categoria. Al renombrar, los productos
-- de la categoria pasan al nombre nuevo para que ninguno quede huerfano.
create or replace function public.save_product_category(payload jsonb)
returns public.product_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category public.product_categories;
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_name text := nullif(trim(payload ->> 'name'), '');
  v_old_name text;
begin
  perform public.require_admin();

  if v_name is null or length(v_name) < 2 then
    raise exception 'El nombre de la categoria es obligatorio';
  end if;

  if exists (
    select 1 from public.product_categories
    where lower(name) = lower(v_name) and id is distinct from v_id
  ) then
    raise exception 'Ya existe una categoria con ese nombre';
  end if;

  if v_id is null then
    insert into public.product_categories (name, is_active)
    values (v_name, coalesce((payload ->> 'isActive')::boolean, true))
    returning * into v_category;
  else
    select name into v_old_name from public.product_categories where id = v_id for update;

    if v_old_name is null then
      raise exception 'Categoria inexistente';
    end if;

    update public.product_categories
    set name = v_name,
        is_active = coalesce((payload ->> 'isActive')::boolean, is_active)
    where id = v_id
    returning * into v_category;

    if v_old_name <> v_name then
      update public.products set category = v_name where category = v_old_name;
    end if;
  end if;

  return v_category;
end;
$$;

revoke execute on function public.save_product_category(jsonb) from public, anon;
grant execute on function public.save_product_category(jsonb) to authenticated;
