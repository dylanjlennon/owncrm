# The test Supabase project

`npm run e2e` and the HTTPS checks in `npm run gate` run against a separate test project with fake data only. Never point them at a real install.

## Leftovers to clean up by hand

A security review in November 2026 left probe objects in the test project. They are not in this repository, and anon or logged-in users can't reach them, but they should go so they don't hide future problems. Removing them needs the project's SQL editor (or an approved database tool), and that approval was not available when the review fixes were made. Run this in the test project's SQL editor:

```sql
-- Check first: the names below should be the only matches.
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'private' and p.proname like 'owncrm_probe%';
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname like 'owncrm_probe%';

-- Then remove them.
drop trigger if exists owncrm_probe7 on auth.users;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname like 'owncrm_probe%' loop
    execute format('drop function %s', f.sig);
  end loop;
end $$;
```

Expected: functions `private.owncrm_probe6`, `owncrm_probe7`, `owncrm_probe8` and `owncrm_probe_fn` (or similar), and the `owncrm_probe7` trigger on `auth.users`. Don't touch `owncrm_block_extra_users`: that trigger is part of the app.

## Migrations not yet applied to the test project

`supabase/migrations/20261107000100_review_fixes.sql` (owner-only helper functions, the alert ceiling in the send gate, the all-clear default, dropping the unused AI key table, repeating follow-ups) has been tested on a blank local Postgres by `npm run gate`, but not yet applied to the test project. Paste it into the test project's SQL editor, then run `supabase/tests/rls.sql` there and check every test passes. Until then, `npm run e2e` runs against the older schema (it is written to pass on both).
