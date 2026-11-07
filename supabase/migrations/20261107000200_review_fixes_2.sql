-- Review fixes, round 2, Nov 2026. Additive: runs after 20261107000100_review_fixes.sql.
-- Apply this BEFORE deploying the app version that needs it (HOW-TO.md, "Updating").

-- ---------------------------------------------------------------- N1, N2: leads held for the digest
-- During a flood, new leads are saved but not emailed one by one. They are listed in a
-- "Many new leads" email instead. 'digest' marks a lead waiting for (or listed in) that email.
alter table public.leads add column if not exists alert_held text
  check (alert_held is null or alert_held in ('digest'));
create index if not exists leads_held_idx on public.leads (received_at) where alert_held is not null and new_alert_at is null;
