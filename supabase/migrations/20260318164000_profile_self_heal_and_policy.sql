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

drop policy if exists "authenticated full access profiles" on public.profiles;
drop policy if exists "profiles select own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

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

select public.backfill_profiles_from_auth_users();
