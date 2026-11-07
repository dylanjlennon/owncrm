-- Review fixes, round 3, Nov 2026. Additive: runs after 20261107000200_review_fixes_2.sql.
-- Apply this BEFORE deploying the app version that needs it (HOW-TO.md, "Updating").
--
-- The whole "may this alert go out?" decision now happens in the database, in one function,
-- under one lock. Before, the app read today's alerts, decided, then saved the email. Requests
-- that arrived at the same moment all read the same count, so 40 form posts at once could all
-- send "New lead", use up the day, and leave no room for "backup stopped" (review round 3, H1;
-- the same race doubled the lead list and the flood notice, M3).
--
-- Review round 4 (still this file, not applied anywhere before): reminders have their own reserve
-- (M2), one "Alerts paused for today" email when a share runs out (M2), escalations always keep
-- room for two people (L5), and this file refuses to run before 20261107000200 has finished (L4).

-- ---------------------------------------------------------------- 0200 must have finished (L4)
-- 20261107000200_review_fixes_2.sql marks itself done on its last line. Without that mark, this
-- file stops before changing anything: the app needs columns that 0200 adds.
do $$
begin
  if to_regclass('private.schema_marks') is null then
    raise exception using
      message = 'Stopped before changing anything: 20261107000200_review_fixes_2.sql has not finished on this database.',
      hint = 'Run 20261107000200_review_fixes_2.sql first. If it stops with a message, do what the message says and run it again. Then run this file.';
  elsif not exists (select 1 from private.schema_marks where name = '20261107000200_review_fixes_2') then
    raise exception using
      message = 'Stopped before changing anything: 20261107000200_review_fixes_2.sql has not finished on this database.',
      hint = 'Run 20261107000200_review_fixes_2.sql first. If it stops with a message, do what the message says and run it again. Then run this file.';
  end if;
end $$;

-- ---------------------------------------------------------------- what each alert is
-- alert_class: which share of the daily alert allowance the email used.
--   lead      a new-lead alert
--   reminder  a no-reply reminder ("No reply yet", and "Still no reply" to owner and backup)
--   digest    the "Many new leads" list
--   system    a problem or notice for the owner
--   critical  an escalation that also goes to the backup contact ("backup stopped")
--   notice    the one "Alerts paused for today" email
-- alert_key: alerts with the same key go out once per de-dupe window.
-- flood_key: where a lead came from (the web form address or the person, hashed). Used to tell
--   one noisy address from real leads (M1).
alter table public.outbound_emails add column if not exists alert_class text;
alter table public.outbound_emails drop constraint if exists outbound_emails_alert_class_check;
alter table public.outbound_emails add constraint outbound_emails_alert_class_check
  check (alert_class is null or alert_class in ('lead','reminder','digest','system','critical','notice'));
alter table public.outbound_emails add column if not exists alert_key text check (alert_key is null or length(alert_key) <= 200);
alter table public.outbound_emails add column if not exists flood_key text check (flood_key is null or length(flood_key) <= 100);
create index if not exists outbound_alert_key_idx on public.outbound_emails (alert_key, created_at) where alert_key is not null;
create index if not exists outbound_flood_key_idx on public.outbound_emails (flood_key, created_at) where flood_key is not null;
alter table public.leads add column if not exists flood_key text check (flood_key is null or length(flood_key) <= 100);
create index if not exists leads_flood_key_idx on public.leads (flood_key, received_at) where flood_key is not null;

-- ---------------------------------------------------------------- the numbers
-- The same numbers as ALERT_POLICY in src/lib/alerts.ts (shown on Status and in tests). With the
-- default 40 alerts a day:
--   lead share 28: new-lead alerts and the lead list. New-lead alerts one by one stop at 22, so 6
--     are always left for the lead list.
--   system share 24: ordinary problems up to 18, the last 6 only for escalations.
--   reminder reserve 4 (M2, round 4): only reply reminders ("No reply yet", and "Still no reply"
--     to owner and backup) may use it. Reminders past it count against the lead share.
--   1 kept for the one "Alerts paused for today" email (only an escalation may take it).
-- Reserves are held out of the whole day's allowance until their own kind uses them. The
-- escalation reserve is never below 2, so "backup stopped" always has room for the owner and the
-- backup contact (L5), and the reminder reserve is never below 3.
create or replace function private.alert_numbers(p_ceiling int) returns jsonb
language sql immutable set search_path = '' as $$
  with c as (select greatest(1, p_ceiling) as ceiling),
  r as (select ceiling, ceil(ceiling * 0.3)::int as system_reserve, ceil(ceiling * 0.4)::int as lead_reserve,
               greatest(2, ceil(ceiling * 0.15))::int as critical_reserve from c)
  select jsonb_build_object(
    'ceiling', ceiling,
    'lead_share', ceiling - system_reserve,
    'system_share', ceiling - lead_reserve,
    'digest_reserve', greatest(1, ceil((ceiling - system_reserve) * 0.2))::int,
    'critical_reserve', critical_reserve,
    'reminder_reserve', greatest(3, ceil(ceiling * 0.1))::int,
    'notice_reserve', 1,
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
  v_notice int;
  v_reminder int;
  v_held int;
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
    select count(*), count(*) filter (where alert_class = 'critical'), count(*) filter (where alert_class = 'notice'),
           count(*) filter (where alert_class = 'reminder')
      into v_alerts, v_critical, v_notice, v_reminder from public.outbound_emails
     where kind in ('alert','system') and status <> 'failed' and created_at >= v_today_start;
    if v_alerts >= s.reserved_alert_budget then
      raise exception 'blocked_alert_budget: today''s alert allowance is used up';
    end if;
    -- The unused part of each reserve stays free for its own kind: the "Alerts paused" email,
    -- escalations, and reply reminders.
    -- (Escalations may use any of it: they matter more than the "Alerts paused" email.)
    v_held := greatest(0, (n->>'notice_reserve')::int - v_notice) + greatest(0, (n->>'critical_reserve')::int - v_critical);
    if coalesce(new.alert_class, '') not in ('critical', 'notice') and v_alerts >= s.reserved_alert_budget - v_held then
      raise exception 'blocked_alert_budget: the rest of today''s alerts are held for escalations';
    end if;
    v_held := v_held + greatest(0, (n->>'reminder_reserve')::int - v_reminder);
    if coalesce(new.alert_class, '') not in ('critical', 'notice', 'reminder') and v_alerts >= s.reserved_alert_budget - v_held then
      raise exception 'blocked_alert_budget: the rest of today''s alerts are held for reply reminders and escalations';
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
-- Version mark. 20261107000100 and 20261107000200 read it and leave a newer guard alone (L4).
comment on function private.outbound_guard() is 'owncrm send guard version 3 (20261107000300_alert_gate.sql)';

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
-- p_notice_body: the text of the "Alerts paused for today" email, in case this alert finds its
--   share used up (the app writes it, because it knows the app's address).
-- Returns {"send": true, "emails": [{"id": ..., "to": ...}]} or {"send": false, "reason": ...}, where reason is one of
-- no_owner, duplicate, daily_max, ceiling, hold (list the lead in the next "Many new leads"),
-- flooded (a reminder for a lead from a noisy address) or paced (a lead list went out too
-- recently). When the refusal is because a share or reserve ran out (ceiling, or hold for lack
-- of room), and the "Alerts paused for today" email has not gone today, that email is saved too,
-- from its own reserve, and returned as "notice": {"emails": [...], "subject": ...} (M2).
drop function if exists public.alert_admit(text, text[], text, text, text, numeric, uuid, uuid, text, int);
create or replace function public.alert_admit(
  p_class text, p_to text[], p_subject text, p_body text,
  p_key text default null, p_dedupe_hours numeric default 12,
  p_lead_id uuid default null, p_household_id uuid default null,
  p_flood_key text default null, p_daily_max int default null,
  p_notice_body text default null
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  s public.app_settings;
  n jsonb;
  v_to text[];
  v_count int;
  v_start timestamptz;
  v_total int; v_lead int; v_system int; v_critical int; v_reminder int; v_notice int; v_month int;
  v_unused_crit int; v_unused_rem int; v_unused_notice int; v_rem_over int;
  v_room int;
  v_free int;
  v_last timestamptz;
  v_hours numeric;
  v_emails jsonb := '[]';
  v_id uuid;
  v_addr text;
  v_owner text;
  v_paused jsonb := null;
  v_class text := case when p_class = 'lead_reminder' then 'reminder' else p_class end;
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
         count(*) filter (where alert_class = 'critical'),
         count(*) filter (where alert_class = 'reminder'),
         count(*) filter (where alert_class = 'notice')
    into v_total, v_lead, v_critical, v_reminder, v_notice
    from public.outbound_emails
   where kind in ('alert','system') and status <> 'failed' and created_at >= v_start;
  v_system := v_total - v_lead - v_reminder - v_notice;
  -- The unused part of each reserve stays free for its own kind. Reminders past their reserve
  -- count against the lead share.
  v_unused_crit := greatest(0, (n->>'critical_reserve')::int - v_critical);
  v_unused_rem := greatest(0, (n->>'reminder_reserve')::int - v_reminder);
  v_unused_notice := greatest(0, (n->>'notice_reserve')::int - v_notice);
  v_rem_over := greatest(0, v_reminder - (n->>'reminder_reserve')::int);
  -- What a new-lead alert, the lead list or a system alert may still use today.
  v_free := (n->>'ceiling')::int - v_unused_crit - v_unused_notice - v_unused_rem - v_total;
  select count(*) into v_month from public.outbound_emails
   where created_at >= (date_trunc('month', now() at time zone s.timezone)) at time zone s.timezone and status <> 'failed';

  if p_class = 'critical' then
    -- Escalations may use their own reserve and anything else left in the system share, even the
    -- email kept for "Alerts paused": "backup stopped" matters more.
    v_room := least((n->>'system_share')::int - v_system, (n->>'ceiling')::int - v_total);
  elsif p_class = 'system' then
    v_room := least((n->>'system_share')::int - (n->>'critical_reserve')::int - v_system, v_free);
  elsif p_class = 'digest' then
    -- The lead list may use the whole lead share.
    v_room := least((n->>'lead_share')::int - v_rem_over - v_lead, v_free);
    -- Paced so the lead share lasts until midnight: at most one an hour, slower when it runs low.
    select max(created_at) into v_last from public.outbound_emails
     where alert_class = 'digest' and status <> 'failed' and created_at >= v_start;
    v_hours := greatest(1, extract(epoch from (v_start + interval '1 day' - now())) / 3600 / greatest(1, (n->>'lead_share')::int - v_rem_over - v_lead));
    if v_last is not null and now() - v_last < make_interval(secs => (v_hours * 3600 - 60)::double precision) then
      return jsonb_build_object('send', false, 'reason', 'paced', 'hours', round(v_hours, 1));
    end if;
  elsif p_class = 'lead_reminder' then
    -- Reminders may use their own reserve, or what is left of the one-by-one part of the lead
    -- share if that is more, but never the escalation or "Alerts paused" reserves. New-lead
    -- alerts can't use the reminder reserve, so a busy day can't switch reminders off (M2).
    if p_flood_key is not null and (
      select count(*) from public.leads where flood_key = p_flood_key and received_at >= now() - interval '24 hours') > (n->>'per_address_day')::int then
      return jsonb_build_object('send', false, 'reason', 'flooded');
    end if;
    v_room := least((n->>'ceiling')::int - v_unused_crit - v_unused_notice - v_total,
                    greatest(v_unused_rem, (n->>'lead_share')::int - (n->>'digest_reserve')::int - v_rem_over - v_lead));
  else
    -- New-lead alerts one by one stop short of the lead list's part of the lead share.
    if p_flood_key is not null and (
      select count(distinct lead_id) from public.outbound_emails
       where flood_key = p_flood_key and alert_class = 'lead' and status <> 'failed'
         and created_at >= now() - interval '24 hours' and lead_id is distinct from p_lead_id) >= (n->>'per_address_day')::int then
      return jsonb_build_object('send', false, 'reason', 'hold');
    end if;
    v_room := least((n->>'lead_share')::int - (n->>'digest_reserve')::int - v_rem_over - v_lead, v_free);
  end if;

  if v_room < v_count or v_month + v_count > s.monthly_email_cap then
    -- A share or reserve ran out. The owner gets one "Alerts paused for today" email, from its own
    -- reserve, the first time this happens in a day.
    v_owner := nullif(btrim(coalesce(s.owner_email, '')), '');
    if v_owner is not null and v_notice = 0 and v_total + 1 <= (n->>'ceiling')::int and v_month + 1 <= s.monthly_email_cap then
      insert into public.outbound_emails (to_address, subject, body_text, kind, alert_class, alert_key)
      values (v_owner, 'Alerts paused for today',
              coalesce(p_notice_body, 'Some alert emails are paused until midnight, because their share of today''s alert allowance is used up. Every lead is still saved. Open the Status page.'),
              'alert', 'notice', 'alerts_paused')
      returning id into v_id;
      v_paused := jsonb_build_object('subject', 'Alerts paused for today', 'emails', jsonb_build_array(jsonb_build_object('id', v_id, 'to', v_owner)));
    end if;
    return jsonb_strip_nulls(jsonb_build_object('send', false, 'reason', case when p_class = 'lead' then 'hold' else 'ceiling' end, 'notice', v_paused));
  end if;

  foreach v_addr in array v_to loop
    insert into public.outbound_emails (to_address, subject, body_text, kind, lead_id, household_id, alert_class, alert_key, flood_key)
    values (v_addr, left(p_subject, 300), p_body, 'alert', p_lead_id, p_household_id, v_class, p_key, p_flood_key)
    returning id into v_id;
    v_emails := v_emails || jsonb_build_array(jsonb_build_object('id', v_id, 'to', v_addr));
  end loop;
  return jsonb_build_object('send', true, 'emails', v_emails);
end $$;
revoke all on function public.alert_admit(text, text[], text, text, text, numeric, uuid, uuid, text, int, text) from public, anon;
grant execute on function public.alert_admit(text, text[], text, text, text, numeric, uuid, uuid, text, int, text) to authenticated, service_role;
revoke all on function private.alert_numbers(int) from public, anon;
grant execute on function private.alert_numbers(int) to authenticated, service_role;
