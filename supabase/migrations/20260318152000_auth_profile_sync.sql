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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.sync_profile_from_auth_user_row();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute procedure public.sync_profile_from_auth_user_row();

select public.backfill_profiles_from_auth_users();
