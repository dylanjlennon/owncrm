-- Review fixes, round 2, Nov 2026. Additive: runs after 20261107000100_review_fixes.sql.
-- Apply this BEFORE deploying the app version that needs it (HOW-TO.md, "Updating").

-- ---------------------------------------------------------------- N1, N2: leads held for the digest
-- During a flood, new leads are saved but not emailed one by one. They are listed in a
-- "Many new leads" email instead. 'digest' marks a lead waiting for (or listed in) that email.
alter table public.leads add column if not exists alert_held text
  check (alert_held is null or alert_held in ('digest'));
create index if not exists leads_held_idx on public.leads (received_at) where alert_held is not null and new_alert_at is null;

-- ---------------------------------------------------------------- N6, N12: the send gate
-- N6: alerts have their own ceiling (reserved_alert_budget), so they no longer count against
-- client email. Client email (one-to-one and marketing) may use daily_email_cap minus that
-- reserve, whatever the alerts did. With the defaults (100 a day, 40 for alerts) that is 60
-- client emails a day, always.
-- N12: the alert ceiling is checked under a transaction lock, so two alerts sent at the same
-- moment can't both see 39 and both go.
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
    -- One alert at a time past this point, until the inserting transaction ends.
    perform pg_catalog.pg_advisory_xact_lock(7314001);
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

  -- Client email only. Alerts are capped on their own above.
  select count(*) filter (where created_at >= v_today_start), count(*) into v_today, v_month
    from public.outbound_emails
   where created_at >= v_month_start and status <> 'failed' and kind not in ('alert','system');
  if v_today >= s.daily_email_cap - s.reserved_alert_budget then
    raise exception 'blocked_budget: the rest of today''s email allowance is held for alerts';
  end if;
  if v_month >= s.monthly_email_cap - s.reserved_alert_budget then
    raise exception 'blocked_budget: the rest of this month''s email allowance is held for alerts';
  end if;
  return new;
end $$;

-- The daily and monthly caps must leave room for client email after the alert reserve.
-- Existing rows are fixed first, so the check can be added on any install.
do $$ begin
  alter table public.app_settings disable trigger audit_settings;
  update public.app_settings set daily_email_cap = reserved_alert_budget + 1 where daily_email_cap <= reserved_alert_budget;
  update public.app_settings set monthly_email_cap = reserved_alert_budget + 1 where monthly_email_cap <= reserved_alert_budget;
  alter table public.app_settings enable trigger audit_settings;
end $$;
alter table public.app_settings drop constraint if exists app_settings_caps_above_alert_reserve;
alter table public.app_settings add constraint app_settings_caps_above_alert_reserve
  check (daily_email_cap > reserved_alert_budget and monthly_email_cap > reserved_alert_budget);

-- ---------------------------------------------------------------- N3: no raw files or refused rows kept
-- Before this fix, a spreadsheet upload was stored whole (raw_csv), and refused rows were copied
-- word for word into the error file (error_csv), including the SSN or health text that got them
-- refused. Both are cleared now. Unfinished uploads have to be uploaded again; finished imports
-- keep their counts but lose the old error file download. From now on an upload stores only rows
-- that passed the checks (cleared after import or after a day) and an error file of line numbers
-- and reasons.
update public.imports set raw_csv = null, error_csv = null where raw_csv is not null or error_csv is not null;

-- ---------------------------------------------------------------- N9: birthdays are month and day only
-- The app stores a birthday as year 2000, so no age is ever kept. Now the database insists on it.
-- Any birthday saved with a real year (only possible through SQL or the API) loses the year.
update public.people
   set birthday = make_date(2000, extract(month from birthday)::int, extract(day from birthday)::int)
 where birthday is not null and extract(year from birthday) <> 2000;
alter table public.people drop constraint if exists people_birthday_month_day_only;
alter table public.people add constraint people_birthday_month_day_only
  check (birthday is null or extract(year from birthday) = 2000);

-- ---------------------------------------------------------------- restoring older backups
-- A backup taken before these rules may hold a birthday with a year, or email caps that are now
-- too low. scripts/restore-to-blank.sh calls restore_begin before loading and restore_finish
-- after, in the same transaction: the data is brought up to today's rules and the checks are
-- put back before anything is committed. Only the database owner (the restore script) can run them.
create or replace function private.restore_begin() returns void
language plpgsql set search_path = '' as $$
begin
  alter table public.people drop constraint if exists people_birthday_month_day_only;
  alter table public.app_settings drop constraint if exists app_settings_caps_above_alert_reserve;
end $$;

create or replace function private.restore_finish() returns void
language plpgsql set search_path = '' as $$
begin
  update public.people
     set birthday = make_date(2000, extract(month from birthday)::int, extract(day from birthday)::int)
   where birthday is not null and extract(year from birthday) <> 2000;
  update public.app_settings set daily_email_cap = reserved_alert_budget + 1 where daily_email_cap <= reserved_alert_budget;
  update public.app_settings set monthly_email_cap = reserved_alert_budget + 1 where monthly_email_cap <= reserved_alert_budget;
  alter table public.people add constraint people_birthday_month_day_only
    check (birthday is null or extract(year from birthday) = 2000);
  alter table public.app_settings add constraint app_settings_caps_above_alert_reserve
    check (daily_email_cap > reserved_alert_budget and monthly_email_cap > reserved_alert_budget);
end $$;
revoke all on function private.restore_begin() from public, anon, authenticated, service_role;
revoke all on function private.restore_finish() from public, anon, authenticated, service_role;
