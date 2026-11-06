-- Lock every table to the one owner with a second factor. This runs last on purpose.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('create policy owner_all on public.%I for all to authenticated using ((select private.is_owner())) with check ((select private.is_owner()))', t.relname);
  end loop;
end $$;

-- Nothing for logged-out visitors. Grants are explicit.
revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- The owner's row can only change from the SQL editor.
revoke insert, update, delete on public.app_owner from authenticated, service_role;
grant select on public.app_owner to authenticated, service_role;

-- Opt-outs and consent history are append only.
revoke update, delete on public.suppressions from authenticated, service_role;
revoke update, delete on public.consent_records from authenticated, service_role;
revoke update, delete on public.audit_log from authenticated, service_role;

-- Only the service key can end all sessions.
revoke all on function public.revoke_all_owner_sessions() from authenticated;
grant execute on function public.revoke_all_owner_sessions() to service_role;

-- The encrypted AI key can't be read back through the API by a logged-in session.
revoke select on public.app_secrets from authenticated;
grant select (name, enabled, updated_at) on public.app_secrets to authenticated;
