-- OwnCRM access test. Runs as real roles with real JWT claims, then rolls everything back.
-- Works in the Supabase SQL editor, through psql, or against the local test database.
do $body$
declare
  v_owner uuid := '00000000-0000-4000-8000-0000000000a1';
  v_other uuid := '00000000-0000-4000-8000-0000000000b2';
  v_hh uuid; v_person uuid; v_hh2 uuid; v_deal uuid; v_batch uuid; v_import uuid;
  v_person2 uuid; v_val text; v_err text; v_ok boolean;
  c jsonb; t text; results jsonb := '[]'::jsonb; cases jsonb := '[]'::jsonb;
  claims jsonb := jsonb_build_object(
    'anon', jsonb_build_object('role','anon'),
    'nonowner', jsonb_build_object('role','authenticated','sub',v_other,'aal','aal2'),
    'owner_aal1', jsonb_build_object('role','authenticated','sub',v_owner,'aal','aal1'),
    'owner', jsonb_build_object('role','authenticated','sub',v_owner,'aal','aal2'),
    'owner_stale', jsonb_build_object('role','authenticated','sub',v_owner,'aal','aal2','session_id','00000000-0000-4000-8000-0000000000c3'),
    'service', jsonb_build_object('role','service_role'));
  roles jsonb := jsonb_build_object('anon','anon','nonowner','authenticated','owner_aal1','authenticated',
    'owner','authenticated','owner_stale','authenticated','service','service_role');
begin
  begin
    -- Fixtures, as the database owner. Start from nothing in this subtransaction.
    update public.app_owner set user_id = v_owner, sessions_valid_after = null where role = 'owner';
    if not found then insert into public.app_owner (user_id) values (v_owner); end if;
    update public.app_settings set owner_email = 'owner@example.com', backup_email = 'backup@example.com',
      postal_address = '1 Test Way, Exampleville', daily_email_cap = 100000, monthly_email_cap = 1000000,
      reserved_alert_budget = 25, sending_paused = false where id;
    insert into public.households (display_name, stage) values ('Testy McExample','new lead') returning id into v_hh;
    insert into public.people (household_id, first_name) values (v_hh, 'Testy') returning id into v_person;
    insert into public.contact_methods (household_id, person_id, kind, value) values
      (v_hh, v_person, 'email', 'blocked-rls@example.com'), (v_hh, v_person, 'phone', '828-555-0100');
    insert into public.households (display_name, stage) values ('Sample Tester','sphere') returning id into v_hh2;
    insert into public.people (household_id, first_name) values (v_hh2, 'Sample') returning id into v_person2;
    insert into public.contact_methods (household_id, person_id, kind, value) values (v_hh2, v_person2, 'email', 'open-rls@example.com');
    insert into public.consent_records (household_id, person_id, status, source) values (v_hh2, v_person2, 'unknown', 'test');
    insert into public.suppressions (kind, value, reason) values ('email', 'Blocked-RLS@Example.com ', 'test');
    insert into public.deals (household_id, side, status, closing_date) values (v_hh2, 'buyer', 'under contract', public.local_today() - 3) returning id into v_deal;
    insert into public.imports (filename) values ('fixture.csv') returning id into v_import;
    insert into public.history_batches (client_batch_id, source, payload) values ('fixture-batch-1', 'gmail', '{}') returning id into v_batch;

    -- Every table and view, every locked-out persona.
    for t in select c2.relname from pg_class c2 join pg_namespace n on n.oid = c2.relnamespace
             where n.nspname = 'public' and c2.relkind in ('r','v') order by 1 loop
      -- v_counts always returns one row of totals, so its total is what must be zero.
      v_val := case when t = 'v_counts' then 'select households + open_deals + open_findings from public.v_counts'
                    else format('select count(*) from public.%I', t) end;
      cases := cases
        || jsonb_build_object('name','anon reads '||t,'as','anon','sql',v_val,'expect','zero_or_denied')
        || jsonb_build_object('name','non-owner reads '||t,'as','nonowner','sql',v_val,'expect','zero_or_denied')
        || jsonb_build_object('name','owner without aal2 reads '||t,'as','owner_aal1','sql',v_val,'expect','zero_or_denied')
        || jsonb_build_object('name','revoked session reads '||t,'as','owner_stale','sql',v_val,'expect','zero_or_denied_if_revoked');
    end loop;

    cases := cases || jsonb_build_array(
      -- Owner with a second factor works.
      jsonb_build_object('name','owner aal2 reads households','as','owner','sql','select count(*) from public.households','expect','positive'),
      jsonb_build_object('name','owner aal2 reads the household view','as','owner','sql','select count(*) from public.v_households','expect','positive'),
      jsonb_build_object('name','owner aal2 reads counts','as','owner','sql','select households from public.v_counts','expect','positive'),
      jsonb_build_object('name','owner aal2 can add a contact','as','owner','sql','insert into public.households (display_name) values (''Owner Added'') returning 1','expect','positive'),
      -- Writes from locked-out personas.
      jsonb_build_object('name','anon cannot insert a household','as','anon','sql','insert into public.households (display_name) values (''x'')','expect','raises'),
      jsonb_build_object('name','non-owner cannot insert a household','as','nonowner','sql','insert into public.households (display_name) values (''x'')','expect','raises'),
      jsonb_build_object('name','owner aal1 cannot insert a household','as','owner_aal1','sql','insert into public.households (display_name) values (''x'')','expect','raises'),
      jsonb_build_object('name','non-owner cannot make itself owner','as','nonowner','sql',format('insert into public.app_owner (user_id) values (%L)',v_other),'expect','raises'),
      jsonb_build_object('name','owner cannot add a second owner','as','owner','sql',format('insert into public.app_owner (user_id) values (%L)',v_other),'expect','raises'),
      jsonb_build_object('name','service key cannot add a second owner','as','service','sql',format('insert into public.app_owner (user_id) values (%L)',v_other),'expect','raises'),
      jsonb_build_object('name','anon cannot run intake','as','anon','sql','select public.intake_lead(''{"email":"a@example.com"}'')','expect','raises'),
      jsonb_build_object('name','anon cannot end sessions','as','anon','sql','select public.revoke_all_owner_sessions()','expect','raises'),
      jsonb_build_object('name','owner session cannot use the service-only function','as','owner','sql','select public.revoke_all_owner_sessions()','expect','raises'),
      jsonb_build_object('name','there is no table for AI keys or logins','as','owner','sql','select count(*) from information_schema.tables where table_schema = ''public'' and (table_name ~ ''secret'' or table_name ~ ''ai_'')','expect','value:0'),
      jsonb_build_object('name','service key runs intake','as','service','sql','select (public.intake_lead(''{"email":"svc-lead@example.com","first_name":"Svc","source":"test"}'')->>''created'')','expect','value:true'),
      -- M1: utility functions answer only the owner (with a second factor) and the server.
      jsonb_build_object('name','non-owner cannot list tables','as','nonowner','sql','select count(*) from public.list_app_tables()','expect','value:0'),
      jsonb_build_object('name','owner without aal2 cannot list tables','as','owner_aal1','sql','select count(*) from public.list_app_tables()','expect','value:0'),
      jsonb_build_object('name','owner lists tables','as','owner','sql','select count(*) from public.list_app_tables()','expect','positive'),
      jsonb_build_object('name','service key lists tables','as','service','sql','select count(*) from public.list_app_tables()','expect','positive'),
      jsonb_build_object('name','non-owner cannot read the database size','as','nonowner','sql','select coalesce(public.db_size_bytes(), 0)','expect','value:0'),
      jsonb_build_object('name','owner reads the database size','as','owner','sql','select public.db_size_bytes()','expect','positive'),
      jsonb_build_object('name','non-owner gets no local date','as','nonowner','sql','select coalesce(public.local_today()::text, ''none'')','expect','value:none'),
      jsonb_build_object('name','owner gets the local date','as','owner','sql','select (public.local_today() is not null)::text','expect','value:true'),
      jsonb_build_object('name','non-owner cannot run cleanup','as','nonowner','sql','select public.run_hygiene()','expect','raises:not_owner'),
      jsonb_build_object('name','owner without aal2 cannot run cleanup','as','owner_aal1','sql','select public.run_hygiene()','expect','raises:not_owner'),
      jsonb_build_object('name','non-owner cannot use the rate limiter','as','nonowner','sql','select public.hit_rate_limit(''x'', 5, 60)','expect','raises:not_owner'),
      jsonb_build_object('name','service key uses the rate limiter','as','service','sql','select public.hit_rate_limit(''rls-x'', 5, 60)::text','expect','value:true'),
      -- Blue #2: the daily all-clear is on by default.
      jsonb_build_object('name','daily all-clear is on by default','as','owner','sql','select all_clear_enabled::text from public.app_settings','expect','value:true'),
      -- Suppression can't be bypassed.
      jsonb_build_object('name','owner cannot send to a suppressed address','as','owner','sql',format('insert into public.outbound_emails (household_id,to_address,subject,body_text,kind) values (%L,''blocked-rls@example.com'',''s'',''b'',''one_to_one'')',v_hh),'expect','raises:blocked_suppressed'),
      jsonb_build_object('name','mixed case and spaces do not get past it','as','owner','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''  BLOCKED-rls@EXAMPLE.com '',''s'',''b'',''one_to_one'')','expect','raises:blocked_suppressed'),
      jsonb_build_object('name','service key cannot send to a suppressed address','as','service','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''blocked-rls@example.com'',''s'',''b'',''one_to_one'')','expect','raises:blocked_suppressed'),
      jsonb_build_object('name','marketing to a suppressed address is blocked','as','owner','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''blocked-rls@example.com'',''s'',''b'',''marketing'')','expect','raises:blocked_suppressed'),
      jsonb_build_object('name','labelling client mail as an alert is blocked','as','owner','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''blocked-rls@example.com'',''s'',''b'',''alert'')','expect','raises:blocked_not_owner'),
      jsonb_build_object('name','owner cannot delete a suppression','as','owner','sql','delete from public.suppressions','expect','raises'),
      jsonb_build_object('name','owner cannot edit a suppression','as','owner','sql','update public.suppressions set reason = ''x''','expect','raises'),
      jsonb_build_object('name','service key cannot delete a suppression','as','service','sql','delete from public.suppressions','expect','raises'),
      jsonb_build_object('name','consent history cannot be rewritten','as','owner','sql','update public.consent_records set status = ''opted_in''','expect','raises'),
      jsonb_build_object('name','normal send to an open address works','as','owner','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''open-rls@example.com'',''s'',''b'',''one_to_one'') returning 1','expect','positive'),
      jsonb_build_object('name','readdressing a queued email is blocked','as','owner','sql','update public.outbound_emails set to_address = ''blocked-rls@example.com'' where to_address = ''open-rls@example.com''','expect','raises'),
      jsonb_build_object('name','marketing with unknown consent is blocked','as','owner','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''open-rls@example.com'',''s'',''b'',''marketing'')','expect','raises:blocked_no_consent'),
      jsonb_build_object('name','alert to the owner works','as','service','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''OWNER@example.com'',''s'',''b'',''alert'') returning 1','expect','positive'),
      -- Derived stage, shared counts, findings.
      jsonb_build_object('name','under contract deal wins over the typed stage','as','owner','sql',format('select display_stage from public.v_households where id = %L',v_hh2),'expect','value:under contract'),
      jsonb_build_object('name','drift is flagged','as','owner','sql',format('select stage_drift::text from public.v_households where id = %L',v_hh2),'expect','value:true'),
      jsonb_build_object('name','cleanup runs for the owner','as','owner','sql','select (public.run_hygiene()->>''added'')::int','expect','positive'),
      jsonb_build_object('name','cleanup finds stage drift','as','owner','sql',format('select count(*) from public.hygiene_findings where household_id = %L and kind = ''stage_drift'' and status = ''open''',v_hh2),'expect','positive'),
      jsonb_build_object('name','cleanup finds a stale deal','as','owner','sql',format('select count(*) from public.hygiene_findings where household_id = %L and kind = ''stale_deal''',v_hh2),'expect','positive'),
      jsonb_build_object('name','cleanup finds missing income','as','owner','sql',format('select count(*) from public.hygiene_findings where household_id = %L and kind = ''missing_income''',v_hh2),'expect','positive'),
      jsonb_build_object('name','cleanup finds a suppressed contact','as','owner','sql',format('select count(*) from public.hygiene_findings where household_id = %L and kind = ''suppressed_contact''',v_hh),'expect','positive'),
      jsonb_build_object('name','a second cleanup adds nothing','as','owner','sql','select public.run_hygiene()->>''added''','expect','value:0'),
      jsonb_build_object('name','ignored finding','as','owner','sql',format('update public.hygiene_findings set status = ''ignored'' where household_id = %L and kind = ''missing_income'' returning 1',v_hh2),'expect','positive'),
      jsonb_build_object('name','ignored stays ignored after cleanup','as','owner','sql','select public.run_hygiene()->>''added''','expect','value:0'),
      jsonb_build_object('name','still exactly one ignored finding','as','owner','sql',format('select count(*) from public.hygiene_findings where household_id = %L and kind = ''missing_income''',v_hh2),'expect','value:1'),
      -- The one importer: create, merge, consent rules, undo.
      jsonb_build_object('name','contract import','as','owner','sql',format($q$select public.import_contract('{"contract_version":"1.0.0","households":[{"household_id":"h1","display_name":"Imp One","stage":"sphere","source_type":"personal","suggested_next_step":"Check in","why":"Last contact 400 days ago"},{"household_id":"h2","display_name":"Merge Me","stage":"past client","source_type":"personal"}],"people":[{"person_id":"p1","household_id":"h1","first_name":"Imp"},{"person_id":"p2","household_id":"h2","first_name":"Merge"}],"contact_methods":[{"household_id":"h1","person_id":"p1","kind":"email","value":"imp1-rls@example.com"},{"household_id":"h2","person_id":"p2","kind":"email","value":"OPEN-rls@example.com"}],"interactions":[{"household_id":"h2","kind":"call","occurred_on":"2025-01-02","summary":"Talked about refinancing"}],"consent":[{"household_id":"h1","person_id":"p1","status":"opted_in","source":"old CRM"}],"suppressions":[{"kind":"email","value":"supp-import@example.com","reason":"old CRM"}],"source_evidence":[{"household_id":"h1","source":"gmail","evidence_type":"email_metadata","message_count":"4"}]}'::jsonb, %L)->>'created'$q$, v_import),'expect','value:1'),
      jsonb_build_object('name','matching email merges instead of duplicating','as','owner','sql',format('select merged_rows from public.imports where id = %L',v_import),'expect','value:1'),
      jsonb_build_object('name','import creates no lead, so no alert','as','owner','sql',format('select count(*) from public.leads l join public.households h on h.id = l.household_id where h.import_id = %L',v_import),'expect','value:0'),
      jsonb_build_object('name','claimed opt-in imports as unknown','as','owner','sql',format('select consent_status from public.v_households where import_id = %L',v_import),'expect','value:unknown'),
      jsonb_build_object('name','imported opt-out is enforced','as','owner','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''supp-import@example.com'',''s'',''b'',''one_to_one'')','expect','raises:blocked_suppressed'),
      jsonb_build_object('name','merged contact keeps its own consent','as','owner','sql',format('select consent_status from public.v_households where id = %L',v_hh2),'expect','value:unknown'),
      jsonb_build_object('name','no table has a message body column','as','owner','sql','select count(*) from information_schema.columns where table_schema = ''public'' and table_name in (''history_batches'',''source_evidence'',''interactions'',''households'') and column_name ~ ''body|message_text|raw_message''','expect','value:0'),
      -- Reserved alert budget.
      jsonb_build_object('name','set a tiny email budget','as','owner','sql','update public.app_settings set daily_email_cap = 3, reserved_alert_budget = 2 returning 1','expect','positive'),
      jsonb_build_object('name','client mail cannot eat the alert budget','as','owner','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''open-rls@example.com'',''s'',''b'',''one_to_one'')','expect','raises:blocked_budget'),
      jsonb_build_object('name','alerts can still use the reserve','as','service','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''owner@example.com'',''s'',''b'',''alert'') returning 1','expect','positive'),
      -- M2: alerts have a hard daily ceiling (reserved_alert_budget = 2, and two alerts went today).
      jsonb_build_object('name','alerts stop at the daily alert ceiling','as','service','sql','insert into public.outbound_emails (to_address,subject,body_text,kind) values (''owner@example.com'',''s'',''b'',''alert'')','expect','raises:blocked_alert_budget'),
      -- Revocation must be proven on the same run.
      jsonb_build_object('name','end all sessions','as','service','sql','select public.revoke_all_owner_sessions() is not null','expect','value:true')
    );

    for c in select * from jsonb_array_elements(cases) loop
      v_val := null; v_err := null;
      begin
        if c->>'expect' = 'zero_or_denied_if_revoked' then
          update public.app_owner set sessions_valid_after = now() where user_id is not null;
        end if;
        execute 'set local role ' || (roles->>(c->>'as'));
        perform set_config('request.jwt.claims', (claims->(c->>'as'))::text, true);
        execute c->>'sql' into v_val;
        perform set_config('request.jwt.claims', '', true);
        execute 'reset role';
      exception when others then
        v_err := sqlerrm;
      end;
      perform set_config('request.jwt.claims', '', true);
      execute 'reset role';
      update public.app_owner set sessions_valid_after = null where user_id is not null and c->>'expect' = 'zero_or_denied_if_revoked';
      v_ok := case
        when c->>'expect' in ('zero_or_denied','zero_or_denied_if_revoked') then v_err is not null or coalesce(v_val,'0') = '0'
        when c->>'expect' = 'positive' then v_err is null and v_val ~ '^[1-9][0-9]*$'
        when c->>'expect' = 'raises' then v_err is not null
        when c->>'expect' like 'raises:%' then v_err like split_part(c->>'expect',':',2) || '%'
        when c->>'expect' like 'value:%' then v_err is null and v_val = split_part(c->>'expect',':',2)
        else v_err is null end;
      results := results || jsonb_build_object('test', c->>'name', 'pass', v_ok, 'got', left(coalesce(v_err, v_val, ''), 160));
    end loop;

    raise exception 'OWNCRM_ROLLBACK';
  exception when others then
    if sqlerrm <> 'OWNCRM_ROLLBACK' then
      results := results || jsonb_build_object('test','harness','pass',false,'got',sqlerrm);
    end if;
  end;
  perform set_config('owncrm.rls_results', results::text, false);
end $body$;

select count(*) as total,
       count(*) filter (where (r->>'pass')::boolean) as passed,
       count(*) filter (where not (r->>'pass')::boolean) as failed,
       coalesce(jsonb_agg(r) filter (where not (r->>'pass')::boolean), '[]'::jsonb) as failures
from jsonb_array_elements(current_setting('owncrm.rls_results')::jsonb) r;
