-- Review fixes, Nov 2026. Additive: runs after the first four files on an existing install.

-- ---------------------------------------------------------------- M1: owner-only utilities
-- True for the owner (with a second factor, see is_owner) and for the server itself
-- (service key, database owner, backups). False for anon and any other logged-in account.
create or replace function private.is_owner_or_backend() returns boolean
language sql stable set search_path = '' as $$
  select current_user not in ('anon', 'authenticated') or private.is_owner()
$$;
revoke all on function private.is_owner_or_backend() from public, anon;
grant execute on function private.is_owner_or_backend() to authenticated, service_role;

create or replace function public.db_size_bytes() returns bigint
language sql stable set search_path = '' as $$
  select case when private.is_owner_or_backend() then pg_catalog.pg_database_size(pg_catalog.current_database()) end
$$;

create or replace function public.list_app_tables() returns setof text
language sql stable set search_path = '' as $$
  select c.relname::text from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','p') and private.is_owner_or_backend()
  order by 1
$$;

create or replace function public.local_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone s.timezone)::date from public.app_settings s where s.id and private.is_owner_or_backend()
$$;

create or replace function public.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int) returns boolean
language plpgsql set search_path = '' as $$
declare v_hits int;
begin
  if not private.is_owner_or_backend() then
    raise exception 'not_owner: rate limits are for the app server';
  end if;
  insert into public.rate_limits as r (bucket, window_start, hits) values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

create or replace function public.run_hygiene() returns jsonb
language plpgsql set search_path = '' as $$
declare v_added int; v_fixed int;
begin
  if not private.is_owner_or_backend() then
    raise exception 'not_owner: only the owner can run cleanup';
  end if;
  with found (household_id, kind, detail, severity) as (
    select h.id, 'no_next_step', 'Active relationship with no dated next step', 'high'
      from public.v_households h
      where h.display_stage in ('new lead','active buyer','active seller','under contract')
        and h.next_follow_up_on is null and h.archived_at is null and not h.is_test
    union all
    select h.id, 'duplicate', 'Same name as another contact', 'medium'
      from public.households h
      where h.archived_at is null and not h.is_test and exists (
        select 1 from public.households o where o.id <> h.id and o.archived_at is null and not o.is_test
          and lower(btrim(o.display_name)) = lower(btrim(h.display_name)))
    union all
    select distinct c.household_id, 'shared_contact', 'Same email or phone is on another contact', 'medium'
      from public.contact_methods c
      join public.households h on h.id = c.household_id and h.archived_at is null and not h.is_test
      where exists (select 1 from public.contact_methods o
        join public.households oh on oh.id = o.household_id and oh.archived_at is null and not oh.is_test
        where o.household_id <> c.household_id and o.kind = c.kind and o.normalized = c.normalized)
    union all
    select distinct c.household_id, 'suppressed_contact', 'An address on this contact is on the opt-out list', 'high'
      from public.contact_methods c
      join public.suppressions x on x.kind = c.kind and x.normalized = c.normalized
      join public.households h on h.id = c.household_id and h.archived_at is null and not h.is_test
      where h.stage <> 'do not contact'
    union all
    select distinct d.household_id, 'stale_deal', 'Under contract with a closing date in the past', 'high'
      from public.deals d where d.status = 'under contract' and d.closing_date < public.local_today()
    union all
    select h.id, 'stage_drift', 'Saved stage is "' || h.stored_stage || '" but deals say "' || h.display_stage || '"', 'medium'
      from public.v_households h where h.stage_drift and h.archived_at is null and not h.is_test
    union all
    select distinct d.household_id, 'missing_income', 'Open deal has no net income, so it is left out of your totals', 'low'
      from public.deals d where d.status in ('prospect','active','under contract') and d.net_to_me is null
  ), added as (
    insert into public.hygiene_findings (household_id, kind, detail, severity)
      select distinct on (f.household_id, f.kind) f.household_id, f.kind, f.detail, f.severity
      from found f
      where not exists (select 1 from public.hygiene_findings e
        where e.household_id = f.household_id and e.kind = f.kind and e.status in ('open','ignored'))
      returning 1
  ), fixed as (
    update public.hygiene_findings e set status = 'fixed', resolved_at = now()
      where e.status = 'open' and not exists (
        select 1 from found f where f.household_id = e.household_id and f.kind = e.kind)
      returning 1
  )
  select (select count(*) from added), (select count(*) from fixed) into v_added, v_fixed;
  return jsonb_build_object('added', v_added, 'fixed', v_fixed);
end $$;

-- ---------------------------------------------------------------- M2: alert ceiling in the send gate
create or replace function private.outbound_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  s public.app_settings;
  v_to text;
  v_today_start timestamptz;
  v_month_start timestamptz;
  v_today int;
  v_month int;
  v_consent text;
  v_alerts int;
begin
  v_to := private.normalize_contact('email', new.to_address);
  select * into s from public.app_settings where id;

  if tg_op = 'UPDATE' then
    raise exception 'A queued email can''t be readdressed. Create a new one.';
  end if;

  v_today_start := (date_trunc('day', now() at time zone s.timezone)) at time zone s.timezone;
  v_month_start := (date_trunc('month', now() at time zone s.timezone)) at time zone s.timezone;

  if new.kind in ('alert','system') then
    if v_to is null or v_to not in (
      coalesce(private.normalize_contact('email', s.owner_email), ''),
      coalesce(private.normalize_contact('email', s.backup_email), '')) then
      raise exception 'blocked_not_owner: alerts only go to the owner or backup contact';
    end if;
    -- Alerts have a daily ceiling too, so a broken check or a form flood can't use up the
    -- provider's allowance. The app keeps a share of it for lead alerts and a share for
    -- system alerts (src/lib/alerts.ts); this is the hard stop behind that.
    select count(*) into v_alerts from public.outbound_emails
     where kind in ('alert','system') and status <> 'failed' and created_at >= v_today_start;
    if v_alerts >= s.reserved_alert_budget then
      raise exception 'blocked_alert_budget: today''s alert allowance is used up';
    end if;
    return new;
  end if;

  if s.sending_paused then
    raise exception 'blocked_paused: sending is paused. Check the Status page.';
  end if;
  if exists (select 1 from public.suppressions x where x.kind = 'email' and x.normalized = v_to) then
    raise exception 'blocked_suppressed: this address is on the opt-out list';
  end if;
  if exists (
    select 1 from public.contact_methods c
    join public.households h on h.id = c.household_id
    left join public.people p on p.id = c.person_id
    where c.kind = 'email' and c.normalized = v_to
      and (h.stage = 'do not contact' or coalesce(p.do_not_contact, false))
  ) then
    raise exception 'blocked_dnc: this contact is marked do not contact';
  end if;
  if new.person_id is not null and exists (
    select 1 from public.people p where p.id = new.person_id and p.do_not_contact
  ) then
    raise exception 'blocked_dnc: this contact is marked do not contact';
  end if;
  if new.kind = 'marketing' then
    if coalesce(btrim(s.postal_address), '') = '' then
      raise exception 'blocked_no_address: marketing email needs your postal address in Settings';
    end if;
    select r.status into v_consent
      from public.consent_records r
      join public.contact_methods c on c.person_id = r.person_id
     where c.kind = 'email' and c.normalized = v_to
     order by r.recorded_at desc limit 1;
    if coalesce(v_consent, 'unknown') <> 'opted_in' then
      raise exception 'blocked_no_consent: no recorded consent for marketing email';
    end if;
  end if;

  select count(*) filter (where created_at >= v_today_start), count(*) into v_today, v_month
    from public.outbound_emails where created_at >= v_month_start and status <> 'failed';
  if v_today >= s.daily_email_cap - s.reserved_alert_budget then
    raise exception 'blocked_budget: the rest of today''s email allowance is held for alerts';
  end if;
  if v_month >= s.monthly_email_cap - s.reserved_alert_budget then
    raise exception 'blocked_budget: the rest of this month''s email allowance is held for alerts';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- blue #2: daily all-clear on by default
alter table public.app_settings alter column all_clear_enabled set default true;
update public.app_settings set all_clear_enabled = true where id and golive_completed_at is null;

-- ---------------------------------------------------------------- L2: no AI key storage
-- The optional AI key setting was never used. It is gone, with its encrypted column.
-- This app never stores an AI login or an AI key.
drop table if exists public.app_secrets;

-- ---------------------------------------------------------------- follow-ups that repeat
alter table public.tasks add column if not exists repeat_days int
  check (repeat_days is null or repeat_days in (7, 14, 30, 90, 180, 365));
