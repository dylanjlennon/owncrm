-- Review fixes, round 3, Nov 2026. Additive: runs after 20261107000200_review_fixes_2.sql.
-- Apply this BEFORE deploying the app version that needs it (HOW-TO.md, "Updating").
--
-- The whole "may this alert go out?" decision now happens in the database, in one function,
-- under one lock. Before, the app read today's alerts, decided, then saved the email. Requests
-- that arrived at the same moment all read the same count, so 40 form posts at once could all
-- send "New lead", use up the day, and leave no room for "backup stopped" (review round 3, H1;
-- the same race doubled the lead list and the flood notice, M3).

-- ---------------------------------------------------------------- what each alert is
-- alert_class: which share of the daily alert allowance the email used.
--   lead      a new-lead alert or a no-reply reminder
--   digest    the "Many new leads" list
--   system    a problem or notice for the owner
--   critical  an escalation that also goes to the backup contact ("backup stopped")
-- alert_key: alerts with the same key go out once per de-dupe window.
-- flood_key: where a lead came from (the web form address or the person, hashed). Used to tell
--   one noisy address from real leads (M1).
alter table public.outbound_emails add column if not exists alert_class text
  check (alert_class is null or alert_class in ('lead','digest','system','critical'));
alter table public.outbound_emails add column if not exists alert_key text check (alert_key is null or length(alert_key) <= 200);
alter table public.outbound_emails add column if not exists flood_key text check (flood_key is null or length(flood_key) <= 100);
create index if not exists outbound_alert_key_idx on public.outbound_emails (alert_key, created_at) where alert_key is not null;
create index if not exists outbound_flood_key_idx on public.outbound_emails (flood_key, created_at) where flood_key is not null;
alter table public.leads add column if not exists flood_key text check (flood_key is null or length(flood_key) <= 100);
create index if not exists leads_flood_key_idx on public.leads (flood_key, received_at) where flood_key is not null;

-- ---------------------------------------------------------------- the numbers
-- The same numbers as ALERT_POLICY in src/lib/alerts.ts (shown on Status and in tests). With the
-- default 40 alerts a day: lead share 28 (one by one up to 22, the last 6 only for the lead
-- list), system share 24 (ordinary problems up to 18, the last 6 only for escalations).
create or replace function private.alert_numbers(p_ceiling int) returns jsonb
language sql immutable set search_path = '' as $$
  with c as (select greatest(1, p_ceiling) as ceiling),
  r as (select ceiling, ceil(ceiling * 0.3)::int as system_reserve, ceil(ceiling * 0.4)::int as lead_reserve,
               greatest(1, ceil(ceiling * 0.15))::int as critical_reserve from c)
  select jsonb_build_object(
    'ceiling', ceiling,
    'lead_share', ceiling - system_reserve,
    'system_share', ceiling - lead_reserve,
    'digest_reserve', greatest(1, ceil((ceiling - system_reserve) * 0.2))::int,
    'critical_reserve', critical_reserve,
    -- One web form address (or one person) gets one-by-one alerts and reminders for this many
    -- leads in 24 hours. More than that and its leads go in the lead list, without reminders.
    'per_address_day', 3)
  from r
$$;

-- ---------------------------------------------------------------- the send gate
-- Same rules as before for client email, plus:
-- - Alerts may not use the last few emails of the day unless they are escalations
--   (alert_class 'critical'). So even an alert saved some other way can't use them up.
-- - Every email counts toward the monthly cap again (L2). Client email stops at the monthly cap
--   minus one day of alerts; alerts may use the rest.
-- - Every send takes the same lock, so the totals are exact.
create or replace function private.outbound_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  s public.app_settings;
  v_to text;
  v_today_start timestamptz;
  v_month_start timestamptz;
  v_today int;
  v_month_all int;
  v_consent text;
  v_alerts int;
  v_critical int;
  n jsonb;
begin
  v_to := private.normalize_contact('email', new.to_address);
  select * into s from public.app_settings where id;

  if tg_op = 'UPDATE' then
    raise exception 'A queued email can''t be readdressed. Create a new one.';
  end if;

  v_today_start := (date_trunc('day', now() at time zone s.timezone)) at time zone s.timezone;
  v_month_start := (date_trunc('month', now() at time zone s.timezone)) at time zone s.timezone;
  -- One email at a time past this point, until the inserting transaction ends.
  perform pg_catalog.pg_advisory_xact_lock(7314001);
  select count(*) into v_month_all from public.outbound_emails where created_at >= v_month_start and status <> 'failed';

  if new.kind in ('alert','system') then
    if v_to is null or v_to not in (
      coalesce(private.normalize_contact('email', s.owner_email), ''),
      coalesce(private.normalize_contact('email', s.backup_email), '')) then
      raise exception 'blocked_not_owner: alerts only go to the owner or backup contact';
    end if;
    n := private.alert_numbers(s.reserved_alert_budget);
    select count(*), count(*) filter (where alert_class = 'critical') into v_alerts, v_critical from public.outbound_emails
     where kind in ('alert','system') and status <> 'failed' and created_at >= v_today_start;
    if v_alerts >= s.reserved_alert_budget then
      raise exception 'blocked_alert_budget: today''s alert allowance is used up';
    end if;
    -- The part of the escalation reserve that escalations have not used yet stays free.
    if coalesce(new.alert_class, '') <> 'critical'
       and v_alerts >= s.reserved_alert_budget - greatest(0, (n->>'critical_reserve')::int - v_critical) then
      raise exception 'blocked_alert_budget: the rest of today''s alerts are held for escalations';
    end if;
    if v_month_all >= s.monthly_email_cap then
      raise exception 'blocked_budget: this month''s email allowance is used up';
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

  -- Client email: the daily cap minus the alert allowance, whatever the alerts did today, and the
  -- monthly cap minus one day of alerts, counting everything sent this month.
  select count(*) into v_today from public.outbound_emails
   where created_at >= v_today_start and status <> 'failed' and kind not in ('alert','system');
  if v_today >= s.daily_email_cap - s.reserved_alert_budget then
    raise exception 'blocked_budget: the rest of today''s email allowance is held for alerts';
  end if;
  if v_month_all >= s.monthly_email_cap - s.reserved_alert_budget then
    raise exception 'blocked_budget: the rest of this month''s email allowance is held for alerts';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- the alert decision
-- The app asks this function and never decides itself. It takes the lock, checks every rule,
-- and, if the alert may go, saves the email rows in the same transaction. The app then hands
-- exactly those rows to the email provider.
-- p_class: 'lead' (new-lead alert), 'lead_reminder' (no reply yet / still no reply), 'digest'
--   (the "Many new leads" list), 'system', 'critical' (also goes to the backup contact).
-- p_key: same key inside p_dedupe_hours = sent once. p_daily_max: at most this many different
--   keys a day that share the part of p_key before the first ":" (for example one "needs
--   review" email per sender, at most 5 senders a day).
-- p_flood_key: where a lead came from, for the per-address rule.
-- Returns {"send": true, "emails": [{"id": ..., "to": ...}]} or {"send": false, "reason": ...}, where reason is one of
-- no_owner, duplicate, daily_max, ceiling, hold (list the lead in the next "Many new leads"),
-- flooded (a reminder for a lead from a noisy address) or paced (a lead list went out too
-- recently).
create or replace function public.alert_admit(
  p_class text, p_to text[], p_subject text, p_body text,
  p_key text default null, p_dedupe_hours numeric default 12,
  p_lead_id uuid default null, p_household_id uuid default null,
  p_flood_key text default null, p_daily_max int default null
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  s public.app_settings;
  n jsonb;
  v_to text[];
  v_count int;
  v_start timestamptz;
  v_total int; v_lead int; v_system int; v_critical int; v_month int;
  v_room int;
  v_free int;
  v_last timestamptz;
  v_hours numeric;
  v_emails jsonb := '[]';
  v_id uuid;
  v_addr text;
  v_class text := case when p_class = 'lead_reminder' then 'lead' else p_class end;
begin
  if not private.is_owner_or_backend() then
    raise exception 'not_owner: alerts are for the app server';
  end if;
  if p_class not in ('lead','lead_reminder','digest','system','critical') then
    raise exception 'unknown alert class %', p_class;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7314001);
  select * into s from public.app_settings where id;
  n := private.alert_numbers(s.reserved_alert_budget);
  select coalesce(array_agg(distinct a), '{}') into v_to from unnest(p_to) a where coalesce(btrim(a), '') <> '';
  v_count := coalesce(array_length(v_to, 1), 0);
  if v_count = 0 then return jsonb_build_object('send', false, 'reason', 'no_owner'); end if;
  v_start := (date_trunc('day', now() at time zone s.timezone)) at time zone s.timezone;

  if p_key is not null and exists (
    select 1 from public.outbound_emails where alert_key = p_key and status <> 'failed'
       and created_at >= now() - make_interval(secs => (p_dedupe_hours * 3600)::double precision)) then
    return jsonb_build_object('send', false, 'reason', 'duplicate');
  end if;
  if p_key is not null and p_daily_max is not null and (
    select count(distinct alert_key) from public.outbound_emails
     where created_at >= v_start and status <> 'failed' and alert_key like split_part(p_key, ':', 1) || ':%') >= p_daily_max then
    return jsonb_build_object('send', false, 'reason', 'daily_max');
  end if;

  -- Today's alerts by share. Rows from before this version have no class: a row about a lead or
  -- a lead list counts as lead, anything else as system.
  select count(*),
         count(*) filter (where coalesce(alert_class, case when lead_id is not null or subject like 'Many new leads%' then 'lead' else 'system' end) in ('lead','digest')),
         count(*) filter (where alert_class = 'critical')
    into v_total, v_lead, v_critical
    from public.outbound_emails
   where kind in ('alert','system') and status <> 'failed' and created_at >= v_start;
  v_system := v_total - v_lead;
  -- What everything but an escalation may still use today: the escalation reserve stays free,
  -- less what escalations already used.
  v_free := (n->>'ceiling')::int - greatest(0, (n->>'critical_reserve')::int - v_critical) - v_total;
  select count(*) into v_month from public.outbound_emails
   where created_at >= (date_trunc('month', now() at time zone s.timezone)) at time zone s.timezone and status <> 'failed';

  if v_total + v_count > (n->>'ceiling')::int or v_month + v_count > s.monthly_email_cap then
    return jsonb_build_object('send', false, 'reason', case when p_class = 'lead' then 'hold' else 'ceiling' end);
  end if;
  if p_class = 'critical' then
    v_room := (n->>'system_share')::int - v_system;
  elsif p_class = 'system' then
    v_room := (n->>'system_share')::int - (n->>'critical_reserve')::int - v_system;
    v_room := least(v_room, v_free);
  elsif p_class = 'digest' then
    v_room := (n->>'lead_share')::int - v_lead;
    v_room := least(v_room, v_free);
    -- Paced so the lead share lasts until midnight: at most one an hour, slower when it runs low.
    select max(created_at) into v_last from public.outbound_emails
     where alert_class = 'digest' and status <> 'failed' and created_at >= v_start;
    v_hours := greatest(1, extract(epoch from (v_start + interval '1 day' - now())) / 3600 / greatest(1, (n->>'lead_share')::int - v_lead));
    if v_last is not null and now() - v_last < make_interval(secs => (v_hours * 3600 - 60)::double precision) then
      return jsonb_build_object('send', false, 'reason', 'paced', 'hours', round(v_hours, 1));
    end if;
  else
    -- One-by-one lead alerts stop short of the part of the lead share kept for the lead list.
    v_room := (n->>'lead_share')::int - (n->>'digest_reserve')::int - v_lead;
    v_room := least(v_room, v_free);
    if p_flood_key is not null and p_class = 'lead' and (
      select count(distinct lead_id) from public.outbound_emails
       where flood_key = p_flood_key and alert_class = 'lead' and status <> 'failed'
         and created_at >= now() - interval '24 hours' and lead_id is distinct from p_lead_id) >= (n->>'per_address_day')::int then
      return jsonb_build_object('send', false, 'reason', 'hold');
    end if;
    if p_flood_key is not null and p_class = 'lead_reminder' and (
      select count(*) from public.leads where flood_key = p_flood_key and received_at >= now() - interval '24 hours') > (n->>'per_address_day')::int then
      return jsonb_build_object('send', false, 'reason', 'flooded');
    end if;
  end if;
  if v_room < v_count then
    return jsonb_build_object('send', false, 'reason', case when p_class = 'lead' then 'hold' else 'ceiling' end);
  end if;

  foreach v_addr in array v_to loop
    insert into public.outbound_emails (to_address, subject, body_text, kind, lead_id, household_id, alert_class, alert_key, flood_key)
    values (v_addr, left(p_subject, 300), p_body, 'alert', p_lead_id, p_household_id, v_class, p_key, p_flood_key)
    returning id into v_id;
    v_emails := v_emails || jsonb_build_array(jsonb_build_object('id', v_id, 'to', v_addr));
  end loop;
  return jsonb_build_object('send', true, 'emails', v_emails);
end $$;
revoke all on function public.alert_admit(text, text[], text, text, text, numeric, uuid, uuid, text, int) from public, anon;
grant execute on function public.alert_admit(text, text[], text, text, text, numeric, uuid, uuid, text, int) to authenticated, service_role;
revoke all on function private.alert_numbers(int) from public, anon;
grant execute on function private.alert_numbers(int) to authenticated, service_role;
