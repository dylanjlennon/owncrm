-- OwnCRM core schema. Every table is owner-only through row level security.
-- Run order is the file name order. Works on a brand new Supabase project.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- New tables and functions do not become reachable by accident.
alter default privileges in schema public revoke all on tables from anon, public;
alter default privileges in schema public revoke all on functions from anon, public;
alter default privileges in schema public revoke all on sequences from anon, public;

-- ---------------------------------------------------------------- ownership
create table public.app_owner (
  user_id uuid primary key,
  -- v1 has one role. A later Assistant role widens this check and adds policies.
  role text not null default 'owner' check (role in ('owner')),
  sessions_valid_after timestamptz,
  created_at timestamptz not null default now()
);
create unique index app_owner_one_owner on public.app_owner (role) where role = 'owner';

-- True only for the listed owner, with a second factor, on a session that was not ended.
-- After "wasn't me", only sessions that started later count. Refreshing an old session
-- keeps its start time, so a stolen refresh token stops working too.
create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
    and exists (
      select 1 from public.app_owner o
      where o.user_id = auth.uid()
        and (o.sessions_valid_after is null
             or exists (select 1 from auth.sessions s
                        where s.id = nullif(auth.jwt()->>'session_id', '')::uuid
                          and s.user_id = o.user_id
                          and s.created_at >= o.sessions_valid_after))
    )
$$;
revoke all on function private.is_owner() from public, anon;
grant execute on function private.is_owner() to authenticated, service_role;

-- Refuses a second account even if someone leaves public signup on.
create function private.block_extra_users() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.app_owner) then
    raise exception 'This install has one login. New accounts are refused.';
  end if;
  return new;
end $$;
revoke all on function private.block_extra_users() from public, anon, authenticated;
create trigger owncrm_block_extra_users before insert on auth.users
  for each row execute function private.block_extra_users();

-- Used by the "wasn't me" link. Service key only. Every session that exists now stops
-- working at once (see is_owner). Nothing is deleted from the auth tables.
create function public.revoke_all_owner_sessions() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.app_owner set sessions_valid_after = now() where user_id is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.revoke_all_owner_sessions() from public, anon, authenticated;
grant execute on function public.revoke_all_owner_sessions() to service_role;

-- ---------------------------------------------------------------- settings
create table public.app_settings (
  id boolean primary key default true check (id),
  display_name text,
  timezone text not null default 'America/New_York',
  owner_email text,
  backup_email text,
  sender_email text,
  reply_to text,
  postal_address text,
  form_consent_wording text not null default 'Yes, you may email me market updates and listings. I can unsubscribe at any time.',
  no_reply_first_minutes int not null default 5 check (no_reply_first_minutes between 1 and 1440),
  no_reply_second_minutes int not null default 15 check (no_reply_second_minutes between 2 and 2880),
  reminder_local_hour int not null default 8 check (reminder_local_hour between 0 and 23),
  all_clear_enabled boolean not null default false,
  all_clear_local_hour int not null default 8 check (all_clear_local_hour between 0 and 23),
  weekly_fake_lead_enabled boolean not null default true,
  daily_email_cap int not null default 100 check (daily_email_cap > 0),
  monthly_email_cap int not null default 3000 check (monthly_email_cap > 0),
  reserved_alert_budget int not null default 25 check (reserved_alert_budget >= 0),
  sending_paused boolean not null default false,
  sending_paused_reason text,
  history_sync_expected_hours int check (history_sync_expected_hours is null or history_sync_expected_hours between 1 and 2160),
  first_run_ack_at timestamptz,
  golive_completed_at timestamptz,
  test_alert_confirmed_at timestamptz,
  last_restore_drill_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint no_reply_order check (no_reply_second_minutes > no_reply_first_minutes)
);
insert into public.app_settings (id) values (true);

create function private.check_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone;
  end if;
  return new;
end $$;
create trigger app_settings_tz before insert or update of timezone on public.app_settings
  for each row execute function private.check_timezone();

-- The one "today" for every due date in the app.
create function public.local_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone s.timezone)::date from public.app_settings s where s.id
$$;

-- ---------------------------------------------------------------- imports
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'csv' check (kind in ('csv','contract','history')),
  filename text,
  status text not null default 'draft' check (status in ('draft','done','undone')),
  raw_csv text,
  mapping jsonb,
  total_rows int not null default 0,
  imported_rows int not null default 0,
  error_rows int not null default 0,
  error_csv text,
  merged_rows int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

-- ---------------------------------------------------------------- contacts
create table public.households (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(display_name) between 1 and 200),
  stage text not null default 'new lead' check (stage in (
    'new lead','active buyer','active seller','under contract',
    'past client','sphere','nurture','cold lead','do not contact')),
  lead_source text,
  source_type text not null default 'unknown' check (source_type in ('personal','firm_provided','portal','unknown')),
  first_contact_on date,
  last_contact_on date,
  home_anniversary date,
  notes text,
  is_test boolean not null default false,
  import_id uuid references public.imports(id) on delete set null,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index households_import_idx on public.households (import_id);
create index households_stage_idx on public.households (stage);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  first_name text not null,
  last_name text,
  role text not null default 'primary',
  birthday date,
  do_not_contact boolean not null default false,
  import_id uuid references public.imports(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index people_household_idx on public.people (household_id);
create index people_import_idx on public.people (import_id);

create function private.normalize_contact(p_kind text, p_value text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'email' then pg_catalog.lower(pg_catalog.btrim(p_value))
    else pg_catalog.right(pg_catalog.regexp_replace(p_value, '[^0-9]', '', 'g'), 10)
  end
$$;

create table public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  kind text not null check (kind in ('email','phone')),
  value text not null check (length(value) between 3 and 320),
  normalized text generated always as (private.normalize_contact(kind, value)) stored,
  is_primary boolean not null default false,
  is_valid boolean not null default true,
  invalid_reason text,
  import_id uuid references public.imports(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (household_id, kind, normalized)
);
create index contact_methods_norm_idx on public.contact_methods (kind, normalized);
create index contact_methods_person_idx on public.contact_methods (person_id);
create index contact_methods_import_idx on public.contact_methods (import_id);

-- The master opt-out. Not tied to a person, so it survives merges, deletes and undo.
-- The app roles can read and add. Nobody can remove a row through the API.
create table public.suppressions (
  kind text not null check (kind in ('email','phone')),
  value text not null,
  normalized text generated always as (private.normalize_contact(kind, value)) stored,
  reason text not null default 'opt-out',
  added_by uuid default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (kind, normalized)
);

-- Consent history. Append only. The latest row per person is the current state.
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  channel text not null default 'email' check (channel in ('email')),
  status text not null check (status in ('unknown','opted_in','opted_out')),
  source text not null,
  source_type text not null default 'unknown' check (source_type in ('personal','firm_provided','portal','unknown')),
  wording text,
  recorded_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index consent_person_idx on public.consent_records (person_id, recorded_at desc);
create index consent_household_idx on public.consent_records (household_id);

-- ---------------------------------------------------------------- work
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  side text not null check (side in ('buyer','seller')),
  status text not null default 'prospect' check (status in ('prospect','active','under contract','closed','dead')),
  property_street text,
  file_link text,
  sale_price numeric(12,2) check (sale_price is null or sale_price >= 0),
  gci numeric(12,2),
  net_to_me numeric(12,2),
  closing_date date,
  import_id uuid references public.imports(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deals_household_idx on public.deals (household_id);
create index deals_import_idx on public.deals (import_id);

create table public.deal_dates (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  label text not null check (length(label) between 1 and 120),
  due_on date not null,
  done_at timestamptz,
  reminded_7_at timestamptz,
  reminded_2_at timestamptz,
  reminded_0_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (deal_id, label)
);
create index deal_dates_due_idx on public.deal_dates (due_on) where done_at is null;

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  kind text not null check (kind in ('call','text','email','meeting','showing','note','system')),
  summary text check (length(summary) <= 20000),
  occurred_at timestamptz not null default now(),
  import_id uuid references public.imports(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index interactions_household_idx on public.interactions (household_id, occurred_at desc);
create index interactions_import_idx on public.interactions (import_id);
create index interactions_person_idx on public.interactions (person_id);

-- Where a relationship was found. Dates and counts only, never message text.
create table public.source_evidence (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source text not null,
  evidence_type text not null,
  first_seen_on date,
  last_seen_on date,
  message_count int check (message_count is null or message_count >= 0),
  why text check (length(why) <= 300),
  import_id uuid references public.imports(id) on delete set null,
  created_at timestamptz not null default now()
);
create index source_evidence_household_idx on public.source_evidence (household_id);
create index source_evidence_import_idx on public.source_evidence (import_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  title text not null check (length(title) between 1 and 300),
  due_on date not null,
  done_at timestamptz,
  import_id uuid references public.imports(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index tasks_household_idx on public.tasks (household_id);
create index tasks_import_idx on public.tasks (import_id);
create index tasks_due_idx on public.tasks (due_on) where done_at is null;

-- ---------------------------------------------------------------- inbound
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  channel text not null check (channel in ('form','email','manual')),
  source text not null,
  source_type text not null default 'unknown',
  received_at timestamptz not null default now(),
  message text check (length(message) <= 5000),
  is_test boolean not null default false,
  new_alert_at timestamptz,
  first_alert_at timestamptz,
  second_alert_at timestamptz,
  replied_at timestamptz,
  replied_via text check (replied_via in ('link','logged','app')),
  created_at timestamptz not null default now()
);
create index leads_household_idx on public.leads (household_id);
create index leads_open_idx on public.leads (received_at) where replied_at is null;

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  provider_id text unique,
  from_address text,
  to_address text,
  subject text,
  text_body text,
  html_body text,
  body_truncated boolean not null default false,
  received_at timestamptz not null default now(),
  parser text,
  status text not null default 'needs_review' check (status in ('parsed','needs_review','resolved','ignored')),
  review_reason text,
  parsed jsonb,
  household_id uuid references public.households(id) on delete set null,
  alerted_at timestamptz,
  resolved_at timestamptz
);
create index inbound_status_idx on public.inbound_emails (status, received_at desc);
create index inbound_household_idx on public.inbound_emails (household_id);

-- ---------------------------------------------------------------- outbound
create table public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  to_address text not null,
  to_normalized text generated always as (private.normalize_contact('email', to_address)) stored,
  subject text not null check (length(subject) between 1 and 300),
  body_text text not null check (length(body_text) <= 100000),
  kind text not null check (kind in ('one_to_one','marketing','alert','system')),
  status text not null default 'queued' check (status in ('queued','sent','delivered','delayed','bounced','complained','failed')),
  provider_id text unique,
  error text,
  sent_at timestamptz,
  last_event_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index outbound_household_idx on public.outbound_emails (household_id);
create index outbound_person_idx on public.outbound_emails (person_id);
create index outbound_lead_idx on public.outbound_emails (lead_id);
create index outbound_created_idx on public.outbound_emails (created_at desc);

create table public.email_events (
  id bigint generated always as identity primary key,
  provider_event_id text unique,
  outbound_id uuid references public.outbound_emails(id) on delete set null,
  type text not null,
  occurred_at timestamptz not null default now(),
  detail jsonb
);
create index email_events_outbound_idx on public.email_events (outbound_id);

-- ---------------------------------------------------------------- operations
create table public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail text
);
create index job_runs_job_idx on public.job_runs (job, started_at desc);

create table public.known_devices (
  device_hash text primary key,
  label text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

create table public.hygiene_findings (
  id bigint generated always as identity primary key,
  household_id uuid references public.households(id) on delete cascade,
  kind text not null check (kind in ('duplicate','shared_contact','no_next_step','stale_deal','stage_drift','suppressed_contact','missing_income')),
  detail text,
  severity text not null default 'medium' check (severity in ('high','medium','low')),
  status text not null default 'open' check (status in ('open','fixed','ignored')),
  found_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index hygiene_household_idx on public.hygiene_findings (household_id);
create index hygiene_status_idx on public.hygiene_findings (status);
-- One live finding per household and kind. History rows are "fixed".
create unique index hygiene_live_idx on public.hygiene_findings (household_id, kind) where status in ('open','ignored');

-- Who did what, without client details. Lets an Assistant role be added later.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  action text not null,
  entity text not null,
  entity_id text
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------- triggers
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger households_updated before update on public.households for each row execute function private.set_updated_at();
create trigger deals_updated before update on public.deals for each row execute function private.set_updated_at();
create trigger settings_updated before update on public.app_settings for each row execute function private.set_updated_at();

create function private.audit() returns trigger
language plpgsql set search_path = '' as $$
declare v_id text;
begin
  if tg_table_name = 'app_settings' then v_id := 'settings';
  elsif tg_table_name = 'suppressions' then v_id := new.kind;
  elsif tg_op = 'DELETE' then v_id := old.id::text;
  else v_id := new.id::text;
  end if;
  insert into public.audit_log (action, entity, entity_id) values (lower(tg_op), tg_table_name, v_id);
  return coalesce(new, old);
end $$;
create trigger audit_households after insert or update or delete on public.households for each row execute function private.audit();
create trigger audit_deals after insert or update or delete on public.deals for each row execute function private.audit();
create trigger audit_settings after update on public.app_settings for each row execute function private.audit();
create trigger audit_suppressions after insert on public.suppressions for each row execute function private.audit();
create trigger audit_outbound after insert on public.outbound_emails for each row execute function private.audit();

-- Outreach moves last contact and stops no-reply alerts. Notes and system rows do not.
create function private.interaction_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind in ('call','text','email','meeting','showing') then
    update public.households
       set last_contact_on = greatest(last_contact_on, new.occurred_at::date),
           first_contact_on = coalesce(first_contact_on, new.occurred_at::date)
     where id = new.household_id;
    update public.leads set replied_at = new.occurred_at, replied_via = 'logged'
     where household_id = new.household_id and replied_at is null and received_at <= new.occurred_at;
  end if;
  return new;
end $$;
create trigger interactions_touch after insert on public.interactions for each row execute function private.interaction_touch();

-- The closing date on a deal is also a key date.
create function private.sync_closing_date() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.closing_date is not null then
    insert into public.deal_dates (deal_id, label, due_on) values (new.id, 'Closing', new.closing_date)
    on conflict (deal_id, label) do update set due_on = excluded.due_on,
      reminded_7_at = case when public.deal_dates.due_on = excluded.due_on then public.deal_dates.reminded_7_at end,
      reminded_2_at = case when public.deal_dates.due_on = excluded.due_on then public.deal_dates.reminded_2_at end,
      reminded_0_at = case when public.deal_dates.due_on = excluded.due_on then public.deal_dates.reminded_0_at end;
  end if;
  return new;
end $$;
create trigger deals_closing after insert or update of closing_date on public.deals for each row execute function private.sync_closing_date();

-- THE SEND GATE. Runs for every role, so a direct API call can't skip it.
create function private.outbound_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  s public.app_settings;
  v_to text;
  v_today_start timestamptz;
  v_month_start timestamptz;
  v_today int;
  v_month int;
  v_consent text;
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
create trigger outbound_guard_trg before insert or update of to_address, kind on public.outbound_emails
  for each row execute function private.outbound_guard();
