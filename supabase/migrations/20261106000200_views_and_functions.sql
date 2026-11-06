-- Views run with the caller's rights, so row level security still applies.

-- The one definition of a household's stage on screen. A deal under contract wins
-- over whatever was typed by hand, so the two can't disagree on screen.
create view public.v_households with (security_invoker = true) as
select h.id, h.display_name, h.stage as stored_stage,
  case
    when h.stage = 'do not contact' then 'do not contact'
    when d.has_uc then 'under contract'
    when d.has_active_seller then 'active seller'
    when d.has_active_buyer then 'active buyer'
    when h.stage = 'under contract' and d.has_closed then 'past client'
    when h.stage = 'under contract' then 'nurture'
    else h.stage
  end as display_stage,
  (h.stage <> 'do not contact' and (
     (d.has_uc and h.stage <> 'under contract')
     or (not d.has_uc and h.stage = 'under contract')
     or (not d.has_uc and d.has_active_seller and h.stage <> 'active seller')
     or (not d.has_uc and not d.has_active_seller and d.has_active_buyer and h.stage <> 'active buyer')
  )) as stage_drift,
  h.lead_source, h.source_type, h.first_contact_on, h.last_contact_on, h.home_anniversary, h.notes,
  h.is_test, h.import_id, h.archived_at, h.created_at, h.updated_at,
  t.next_follow_up_on, t.next_step,
  pr.primary_person_id, pr.primary_person_name,
  cm.primary_email, cm.primary_phone,
  coalesce(cn.consent_status, 'unknown') as consent_status,
  cn.consent_source, cn.consent_at, cn.consent_source_type,
  lower(coalesce(h.display_name,'') || ' ' || coalesce(pr.all_names,'') || ' ' || coalesce(cm.all_values,'')) as search_text
from public.households h
cross join lateral (
  select coalesce(bool_or(x.status = 'under contract'), false) as has_uc,
         coalesce(bool_or(x.status = 'active' and x.side = 'seller'), false) as has_active_seller,
         coalesce(bool_or(x.status = 'active' and x.side = 'buyer'), false) as has_active_buyer,
         coalesce(bool_or(x.status = 'closed'), false) as has_closed
  from public.deals x where x.household_id = h.id
) d
left join lateral (
  select x.due_on as next_follow_up_on, x.title as next_step
  from public.tasks x where x.household_id = h.id and x.done_at is null
  order by x.due_on asc, x.created_at asc limit 1
) t on true
left join lateral (
  select (array_agg(p.id order by (p.role = 'primary') desc, p.created_at))[1] as primary_person_id,
         (array_agg(concat_ws(' ', p.first_name, p.last_name) order by (p.role = 'primary') desc, p.created_at))[1] as primary_person_name,
         string_agg(concat_ws(' ', p.first_name, p.last_name), ' ') as all_names
  from public.people p where p.household_id = h.id
) pr on true
left join lateral (
  select (array_agg(c.value order by c.is_primary desc, c.created_at) filter (where c.kind = 'email'))[1] as primary_email,
         (array_agg(c.value order by c.is_primary desc, c.created_at) filter (where c.kind = 'phone'))[1] as primary_phone,
         string_agg(c.value || ' ' || c.normalized, ' ') as all_values
  from public.contact_methods c where c.household_id = h.id
) cm on true
left join lateral (
  select case
           when exists (
             select 1 from public.contact_methods c
             join public.suppressions s on s.kind = c.kind and s.normalized = c.normalized
             where c.household_id = h.id and c.kind = 'email'
           ) then 'opted_out'
           else r.status
         end as consent_status,
         r.source as consent_source, r.recorded_at as consent_at, r.source_type as consent_source_type
  from (select 1) one
  left join lateral (
    select * from public.consent_records x where x.household_id = h.id
    order by x.recorded_at desc limit 1
  ) r on true
) cn on true;

-- THE ONE SOURCE FOR EVERY COUNT ON EVERY SCREEN. Test rows never count.
create view public.v_counts with (security_invoker = true) as
select
  (select count(*) from public.v_households h where h.archived_at is null and not h.is_test)::int as households,
  (select count(*) from public.v_households h where h.archived_at is null and not h.is_test and h.display_stage = 'new lead')::int as new_leads,
  (select count(*) from public.leads l where l.replied_at is null and not l.is_test)::int as unreplied_leads,
  (select count(*) from public.tasks t join public.households h on h.id = t.household_id
     where t.done_at is null and t.due_on <= public.local_today() and h.archived_at is null and not h.is_test)::int as followups_due,
  (select count(*) from public.deal_dates dd join public.deals d on d.id = dd.deal_id
     where dd.done_at is null and d.status in ('active','under contract') and dd.due_on <= public.local_today() + 7)::int as deal_dates_soon,
  (select count(*) from public.deals d where d.status in ('active','under contract'))::int as open_deals,
  (select count(*) from public.inbound_emails e where e.status = 'needs_review')::int as needs_review,
  (select count(*) from public.hygiene_findings f where f.status = 'open')::int as open_findings;

create view public.v_today_followups with (security_invoker = true) as
select t.id, t.household_id, t.title, t.due_on, h.display_name, h.primary_phone, h.primary_email,
       (t.due_on < public.local_today()) as overdue
from public.tasks t join public.v_households h on h.id = t.household_id
where t.done_at is null and t.due_on <= public.local_today() and h.archived_at is null and not h.is_test
order by t.due_on, t.created_at;

create view public.v_today_deal_dates with (security_invoker = true) as
select dd.id, dd.deal_id, dd.label, dd.due_on, d.property_street, d.side, d.status, d.household_id, h.display_name,
       (dd.due_on - public.local_today()) as days_out
from public.deal_dates dd
join public.deals d on d.id = dd.deal_id
join public.households h on h.id = d.household_id
where dd.done_at is null and d.status in ('active','under contract') and dd.due_on <= public.local_today() + 7
order by dd.due_on;

create view public.v_unreplied_leads with (security_invoker = true) as
select l.id, l.household_id, l.source, l.received_at, l.channel, h.display_name, h.primary_phone, h.primary_email
from public.leads l join public.v_households h on h.id = l.household_id
where l.replied_at is null and not l.is_test
order by l.received_at;

-- WHO DO I CALL? Dates and stage only. Nothing about who someone is.
create view public.v_next_best_actions with (security_invoker = true) as
select * from (
  select h.id as household_id, h.display_name, h.display_stage, h.next_step, h.next_follow_up_on, h.last_contact_on, h.primary_phone,
    case
      when h.display_stage = 'new lead' and h.last_contact_on is null then 0
      when h.next_follow_up_on <= public.local_today() then 0
      when h.display_stage in ('under contract','active buyer','active seller')
           and coalesce(h.last_contact_on, date '1900-01-01') < public.local_today() - 7 then 1
      when h.display_stage = 'past client'
           and coalesce(h.last_contact_on, date '1900-01-01') < public.local_today() - 90 then 2
      when h.display_stage in ('nurture','sphere')
           and coalesce(h.last_contact_on, date '1900-01-01') < public.local_today() - 90 then 3
      when h.display_stage = 'cold lead'
           and coalesce(h.last_contact_on, date '1900-01-01') < public.local_today() - 180 then 4
    end as priority
  from public.v_households h
  where h.archived_at is null and not h.is_test and h.display_stage <> 'do not contact'
) ranked where priority is not null
order by priority, last_contact_on nulls first;

-- Latest result per job, used by Status and the banner.
create view public.v_job_status with (security_invoker = true) as
select j.job,
  (select max(r.finished_at) from public.job_runs r where r.job = j.job and r.ok) as last_success_at,
  (select max(r.finished_at) from public.job_runs r where r.job = j.job and r.ok is false) as last_failure_at,
  (select r.ok from public.job_runs r where r.job = j.job and r.finished_at is not null order by r.finished_at desc limit 1) as last_ok,
  (select r.detail from public.job_runs r where r.job = j.job and r.finished_at is not null order by r.finished_at desc limit 1) as last_detail
from (select distinct job from public.job_runs) j;

create view public.v_email_usage with (security_invoker = true) as
select
  count(*) filter (where e.created_at >= ((date_trunc('day', now() at time zone s.timezone)) at time zone s.timezone))::int as sent_today,
  count(*)::int as sent_this_month,
  count(*) filter (where e.kind in ('alert','system') and e.created_at >= ((date_trunc('day', now() at time zone s.timezone)) at time zone s.timezone))::int as alerts_today,
  count(*) filter (where e.status = 'bounced')::int as bounces_this_month,
  count(*) filter (where e.status = 'complained')::int as complaints_this_month,
  s.daily_email_cap, s.monthly_email_cap, s.reserved_alert_budget
from public.app_settings s
left join public.outbound_emails e
  on e.status <> 'failed'
 and e.created_at >= ((date_trunc('month', now() at time zone s.timezone)) at time zone s.timezone)
group by s.daily_email_cap, s.monthly_email_cap, s.reserved_alert_budget;

create function public.db_size_bytes() returns bigint
language sql stable set search_path = '' as $$ select pg_catalog.pg_database_size(pg_catalog.current_database()) $$;

-- The list of tables the logged-out self-test must try. New tables are picked up on their own.
create function public.list_app_tables() returns setof text
language sql stable set search_path = '' as $$
  select c.relname::text from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','p')
  order by 1
$$;

-- Shared rate limit that works across serverless instances. True means allowed.
create function public.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int) returns boolean
language plpgsql set search_path = '' as $$
declare v_hits int;
begin
  insert into public.rate_limits as r (bucket, window_start, hits) values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- ONE WAY IN for every lead, whatever the channel. Returns the lead and household.
create function public.intake_lead(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_email text := nullif(btrim(p->>'email'), '');
  v_phone text := nullif(btrim(p->>'phone'), '');
  v_first text := coalesce(nullif(btrim(p->>'first_name'), ''), 'Unknown');
  v_last text := nullif(btrim(p->>'last_name'), '');
  v_source text := coalesce(nullif(btrim(p->>'source'), ''), 'web form');
  v_source_type text := coalesce(nullif(p->>'source_type', ''), 'unknown');
  v_channel text := coalesce(nullif(p->>'channel', ''), 'form');
  v_consent text := coalesce(nullif(p->>'consent_status', ''), 'unknown');
  v_wording text := p->>'consent_wording';
  v_is_test boolean := coalesce((p->>'is_test')::boolean, false);
  v_household uuid;
  v_person uuid;
  v_lead uuid;
  v_created boolean := false;
begin
  if v_email is null and v_phone is null then
    raise exception 'A lead needs an email or a phone number';
  end if;
  if not v_is_test then
    select c.household_id into v_household from public.contact_methods c
      join public.households h on h.id = c.household_id
     where h.archived_at is null and not h.is_test and (
       (v_email is not null and c.kind = 'email' and c.normalized = private.normalize_contact('email', v_email))
       or (v_phone is not null and c.kind = 'phone' and c.normalized = private.normalize_contact('phone', v_phone)))
     order by c.created_at limit 1;
  end if;
  if v_household is null then
    insert into public.households (display_name, stage, lead_source, source_type, first_contact_on, is_test)
      values (concat_ws(' ', v_first, v_last), 'new lead', v_source, v_source_type, public.local_today(), v_is_test)
      returning id into v_household;
    insert into public.people (household_id, first_name, last_name) values (v_household, v_first, v_last)
      returning id into v_person;
    v_created := true;
  else
    select id into v_person from public.people where household_id = v_household
      order by (role = 'primary') desc, created_at limit 1;
  end if;
  if v_email is not null then
    insert into public.contact_methods (household_id, person_id, kind, value, is_primary)
      values (v_household, v_person, 'email', v_email, v_created)
      on conflict (household_id, kind, normalized) do nothing;
  end if;
  if v_phone is not null then
    insert into public.contact_methods (household_id, person_id, kind, value, is_primary)
      values (v_household, v_person, 'phone', v_phone, v_created)
      on conflict (household_id, kind, normalized) do nothing;
  end if;
  insert into public.consent_records (household_id, person_id, status, source, source_type, wording)
    values (v_household, v_person, v_consent, v_source, v_source_type, v_wording);
  insert into public.leads (household_id, channel, source, source_type, message, is_test)
    values (v_household, v_channel, v_source, v_source_type, left(p->>'message', 5000), v_is_test)
    returning id into v_lead;
  insert into public.interactions (household_id, person_id, kind, summary)
    values (v_household, v_person, 'system',
      'Lead received from ' || v_source || coalesce(': ' || left(nullif(p->>'message',''), 2000), ''));
  return jsonb_build_object('lead_id', v_lead, 'household_id', v_household, 'person_id', v_person, 'created', v_created);
end $$;

-- THE ONE IMPORTER. CSV files, rescue contract folders and history batches all come through here.
-- The app checks the folder against the contract first (contract/lib/validate.mjs).
-- Rules enforced here too: nobody is emailed (no lead rows, so no alerts), every opt-in claim is
-- stored as unknown until the owner confirms it, opt-outs are always kept, and a matching email
-- or phone merges into the existing contact instead of making a duplicate.
create function public.import_contract(p jsonb, p_import uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  hmap jsonb := '{}'::jsonb;
  pmap jsonb := '{}'::jsonb;
  r jsonb;
  v_h uuid; v_p uuid; v_existing uuid; v_hid uuid;
  v_created int := 0; v_merged int := 0; v_n int := 0;
  v_status text; v_source text;
begin
  perform 1 from public.imports where id = p_import and status = 'draft' for update;
  if not found then raise exception 'That import is not open'; end if;
  if split_part(coalesce(p->>'contract_version', ''), '.', 1) <> '1' then
    raise exception 'Unsupported contract version %', p->>'contract_version';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p->'households', '[]'::jsonb)) loop
    v_existing := null;
    select c.household_id into v_existing
      from public.contact_methods c
      join public.households h on h.id = c.household_id
      join jsonb_array_elements(coalesce(p->'contact_methods', '[]'::jsonb)) m
        on m->>'household_id' = r->>'household_id'
       and c.kind = m->>'kind' and c.normalized = private.normalize_contact(m->>'kind', m->>'value')
     where h.archived_at is null and not h.is_test
     order by c.created_at limit 1;
    if v_existing is not null then
      v_h := v_existing; v_merged := v_merged + 1;
      update public.households set
        first_contact_on = least(first_contact_on, (r->>'first_contact_on')::date),
        last_contact_on = greatest(last_contact_on, (r->>'last_contact_on')::date)
      where id = v_h;
    else
      insert into public.households (display_name, stage, lead_source, source_type, first_contact_on, last_contact_on, notes, import_id)
        values (r->>'display_name', r->>'stage', r->>'lead_source', r->>'source_type',
                (r->>'first_contact_on')::date, (r->>'last_contact_on')::date, r->>'summary', p_import)
        returning id into v_h;
      v_created := v_created + 1;
    end if;
    hmap := hmap || jsonb_build_object(r->>'household_id', jsonb_build_object('id', v_h, 'new', v_existing is null));
    if nullif(r->>'suggested_next_step', '') is not null then
      insert into public.tasks (household_id, title, due_on, import_id)
        values (v_h, left(r->>'suggested_next_step' || coalesce(' (suggested: ' || (r->>'why') || ')', ' (suggested)'), 300),
                coalesce((r->>'suggested_next_step_on')::date, public.local_today() + 7), p_import);
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'people', '[]'::jsonb)) loop
    v_hid := (hmap->(r->>'household_id')->>'id')::uuid;
    if (hmap->(r->>'household_id')->>'new')::boolean then
      insert into public.people (household_id, first_name, last_name, role, import_id)
        values (v_hid, r->>'first_name', r->>'last_name', coalesce(nullif(r->>'role', ''), 'primary'), p_import)
        returning id into v_p;
    else
      select id into v_p from public.people where household_id = v_hid order by (role = 'primary') desc, created_at limit 1;
    end if;
    pmap := pmap || jsonb_build_object(r->>'person_id', v_p);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'contact_methods', '[]'::jsonb)) loop
    insert into public.contact_methods (household_id, person_id, kind, value, is_primary, import_id)
      values ((hmap->(r->>'household_id')->>'id')::uuid, (pmap->>(r->>'person_id'))::uuid, r->>'kind', r->>'value',
              (hmap->(r->>'household_id')->>'new')::boolean, p_import)
      on conflict (household_id, kind, normalized) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'deals', '[]'::jsonb)) loop
    insert into public.deals (household_id, side, status, property_street, closing_date, net_to_me, import_id)
      values ((hmap->(r->>'household_id')->>'id')::uuid, r->>'side', r->>'status', r->>'property_street',
              (r->>'closing_date')::date, (r->>'net_to_me')::numeric, p_import);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'interactions', '[]'::jsonb)) loop
    insert into public.interactions (household_id, kind, summary, occurred_at, import_id)
      values ((hmap->(r->>'household_id')->>'id')::uuid, r->>'kind', r->>'summary', ((r->>'occurred_on')::date)::timestamptz, p_import);
  end loop;

  -- Households with no consent row still get one: unknown, from this import.
  for r in select * from jsonb_array_elements(coalesce(p->'households', '[]'::jsonb)) loop
    if (hmap->(r->>'household_id')->>'new')::boolean
       and not exists (select 1 from jsonb_array_elements(coalesce(p->'consent', '[]'::jsonb)) c where c->>'household_id' = r->>'household_id') then
      v_hid := (hmap->(r->>'household_id')->>'id')::uuid;
      insert into public.consent_records (household_id, person_id, status, source, source_type)
        values (v_hid, (select id from public.people where household_id = v_hid order by created_at limit 1), 'unknown',
                'Imported (' || coalesce((select kind from public.imports where id = p_import), 'file') || ')', coalesce(r->>'source_type', 'unknown'));
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'consent', '[]'::jsonb)) loop
    v_status := case when r->>'status' = 'opted_out' then 'opted_out' else 'unknown' end;
    v_source := case when r->>'status' = 'opted_in'
      then 'Import says opted in, not confirmed: ' || (r->>'source') else r->>'source' end;
    v_hid := (hmap->(r->>'household_id')->>'id')::uuid;
    -- Never downgrade a contact that already existed. Only an opt-out is added to it.
    continue when not (hmap->(r->>'household_id')->>'new')::boolean and v_status <> 'opted_out';
    insert into public.consent_records (household_id, person_id, status, source, wording, recorded_at)
      values (v_hid, coalesce((pmap->>(r->>'person_id'))::uuid, (select id from public.people where household_id = v_hid order by created_at limit 1)),
              v_status, left(v_source, 300), r->>'wording', coalesce(((r->>'recorded_on')::date)::timestamptz, now()));
    if v_status = 'opted_out' then
      insert into public.suppressions (kind, value, reason)
        select 'email', c.value, 'opt-out from import' from public.contact_methods c where c.household_id = v_hid and c.kind = 'email'
        on conflict (kind, normalized) do nothing;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'suppressions', '[]'::jsonb)) loop
    insert into public.suppressions (kind, value, reason) values (r->>'kind', r->>'value', coalesce(r->>'reason', 'imported opt-out'))
      on conflict (kind, normalized) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'source_evidence', '[]'::jsonb)) loop
    insert into public.source_evidence (household_id, source, evidence_type, first_seen_on, last_seen_on, message_count, why, import_id)
      values ((hmap->(r->>'household_id')->>'id')::uuid, r->>'source', r->>'evidence_type', (r->>'first_seen_on')::date,
              (r->>'last_seen_on')::date, (r->>'message_count')::int, r->>'why', p_import);
  end loop;

  update public.imports set status = 'done', imported_rows = v_created, merged_rows = v_merged, raw_csv = null where id = p_import;
  return jsonb_build_object('created', v_created, 'merged', v_merged);
end $$;

-- WEEKLY CLEANUP. Adds what it finds, closes what got fixed. Changes no client records.
-- Findings keep their history. Anything you ignored stays ignored.
create function public.run_hygiene() returns jsonb
language plpgsql set search_path = '' as $$
declare v_added int; v_fixed int;
begin
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

-- Undo and the weekly test lead cleanup remove rows from the app (src/lib/undo.ts), not from a
-- database function, so every removal is an ordinary owner request that row level security checks.
