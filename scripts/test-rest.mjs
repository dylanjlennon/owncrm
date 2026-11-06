#!/usr/bin/env node
// Real HTTPS checks against a Supabase project, as a logged-out visitor, a non-owner, the owner
// without a second factor, and the owner with one. Needs .env.local and .e2e/accounts.json.
// Writes nothing except one fake opt-out row, which it then proves it can't remove.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { loadEnv, api, passwordLogin, ownerAal2 } from './lib-auth.mjs';

const env = { ...loadEnv(), ...process.env };
const url = env.SUPABASE_URL; const anon = env.SUPABASE_ANON_KEY;
if (!url || !anon || !existsSync('.e2e/accounts.json')) { console.log('SKIP: no .env.local or test accounts'); process.exit(0); }
const accounts = JSON.parse(readFileSync('.e2e/accounts.json', 'utf8'));
const relations = [...new Set(readdirSync('supabase/migrations').flatMap((f) => [...readFileSync(`supabase/migrations/${f}`, 'utf8').matchAll(/create (?:table|view) public\.(\w+)/g)].map((m) => m[1])))];
const results = [];
const check = (name, ok, got) => { results.push({ name, ok }); if (!ok) console.log(`FAIL ${name}: ${JSON.stringify(got).slice(0, 200)}`); };
// v_counts always answers with one row of totals; for a locked-out caller every total must be zero.
const empty = (r) => r.status >= 400 || (Array.isArray(r.data) && (r.data.length === 0 || r.data.every((row) => Object.values(row).every((v) => v === 0))));

const other = await passwordLogin(url, anon, accounts.other_email, accounts.other_password);
const { aal1, aal2 } = await ownerAal2(url, anon, accounts);
for (const t of relations) {
  check(`logged out reads ${t}`, empty(await api(url, anon, `/rest/v1/${t}?select=*&limit=1`)), t);
  check(`non-owner reads ${t}`, empty(await api(url, anon, `/rest/v1/${t}?select=*&limit=1`, { token: other.access_token })), t);
  check(`owner without second factor reads ${t}`, empty(await api(url, anon, `/rest/v1/${t}?select=*&limit=1`, { token: aal1.access_token })), t);
}
const settings = await api(url, anon, '/rest/v1/app_settings?select=id', { token: aal2.access_token });
check('owner with second factor reads settings', settings.status === 200 && settings.data.length === 1, settings);
check('logged out cannot call intake', (await api(url, anon, '/rest/v1/rpc/intake_lead', { method: 'POST', body: { p: { email: 'x@example.com' } } })).status >= 400, '');
check('owner session cannot end all sessions', (await api(url, anon, '/rest/v1/rpc/revoke_all_owner_sessions', { method: 'POST', token: aal2.access_token, body: {} })).status >= 400, '');
check('non-owner cannot make itself owner', (await api(url, anon, '/rest/v1/app_owner', { method: 'POST', token: other.access_token, body: { user_id: accounts.other_id } })).status >= 400, '');
const ins = await api(url, anon, '/rest/v1/suppressions', { method: 'POST', token: aal2.access_token, headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: { kind: 'email', value: 'rest-optout@example.com', reason: 'test' } });
check('owner can add an opt-out', ins.status < 300, ins);
const del = await api(url, anon, '/rest/v1/suppressions?normalized=eq.rest-optout@example.com', { method: 'DELETE', token: aal2.access_token });
check('owner cannot delete an opt-out through the API', del.status >= 400, del);
const send = await api(url, anon, '/rest/v1/outbound_emails', { method: 'POST', token: aal2.access_token, body: { to_address: 'REST-OPTOUT@example.com', subject: 's', body_text: 'b', kind: 'one_to_one' } });
check('direct API send to an opted-out address is blocked', send.status >= 400 && JSON.stringify(send.data).includes('blocked_suppressed'), send);
const settingsPublic = await api(url, anon, '/auth/v1/settings');
console.log(`Public signup on this project: ${settingsPublic.data.disable_signup ? 'off' : 'ON (the self-test flags this; the database trigger still refuses new accounts)'}`);
const failed = results.filter((r) => !r.ok);
console.log(`REST checks against ${new URL(url).host}: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
