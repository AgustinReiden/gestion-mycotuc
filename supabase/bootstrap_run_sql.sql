-- Ejecutar UNA vez en el SQL Editor de Supabase (proyecto mycotuc).
-- Crea public.run_sql(query) para que el MCP supabase-mycotuc pueda ejecutar SQL.
-- Solo service_role puede llamarla; anon y authenticated quedan sin acceso.
create or replace function public.run_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', query) into result;
  return result;
exception when syntax_error or wrong_object_type then
  execute query;
  return '[]'::jsonb;
end;
$$;

revoke all on function public.run_sql(text) from public, anon, authenticated;
grant execute on function public.run_sql(text) to service_role;
