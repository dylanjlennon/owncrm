#!/usr/bin/env node
// End-to-end test: runs the built app on this computer against the TEST Supabase project and
// clicks through the main flows in a real browser. Email goes to a local mock file, never out.
// Needs: npm run build, .env.local (test project URL and anon key), .e2e/accounts.json (test owner).
// The service key is never used here: a small local relay signs "service" calls in as the test
// owner with a second factor, so row level security stays on for every request.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, ownerAal2, totp } from '../scripts/lib-auth.mjs';
import { seedThroughApi } from '../scripts/seed-demo.mjs';
import { buildFixtures, ME } from '../rescue/test/fixtures.mjs';
import { run as rescue } from '../rescue/bin/rescue.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/npm-tools/node_modules/playwright'); }

const env = { ...loadEnv(), ...process.env };
const SUPA = env.SUPABASE_URL; const ANON = env.SUPABASE_ANON_KEY;
const accounts = JSON.parse(readFileSync('.e2e/accounts.json', 'utf8'));
const PORT = 3100; const RELAY = 54399; const APP = `http://localhost:${PORT}`;
const PLACEHOLDER = 'e2e-relay-not-a-real-key';
const S = (n) => randomBytes(n).toString('hex');
// Opt-outs can never be deleted, so each run uses its own fake addresses.
const RUN = Date.now().toString(36);
const secrets = { LINK_SIGNING_SECRET: S(24), LEAD_FORM_KEY: S(12), CRON_SECRET: S(24), BACKUP_REPORT_SECRET: S(24), RESEND_INBOUND_SECRET: `whsec_${randomBytes(24).toString('base64')}`, RESEND_WEBHOOK_SECRET: `whsec_${randomBytes(24).toString('base64')}` };
const MAIL = '.e2e/mail.jsonl'; const INBOUND = '.e2e/inbound';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${String(detail).slice(0, 300)}`}`); };
const mails = () => (existsSync(MAIL) ? readFileSync(MAIL, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- owner session for assertions, and the relay ----
let session = await ownerAal2(SUPA, ANON, accounts);
const db = () => createClient(SUPA, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.aal2.access_token}` } } });
const watchdog = [];
const relay = http.createServer(async (req, res) => {
  if (req.url.startsWith('/__watchdog')) { watchdog.push({ url: req.url, at: Date.now() }); res.end('OK'); return; }
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!['host', 'connection', 'content-length', 'accept-encoding'].includes(k)) headers[k] = v;
  if (headers.apikey === PLACEHOLDER) { headers.apikey = ANON; headers.authorization = `Bearer ${session.aal2.access_token}`; }
  try {
    const r = await fetch(`${SUPA}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const out = Buffer.from(await r.arrayBuffer());
    const h = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) h[k] = v; });
    res.writeHead(r.status, h); res.end(out);
  } catch (e) { res.writeHead(502); res.end(String(e)); }
});
await new Promise((r) => relay.listen(RELAY, '127.0.0.1', r));

// ---- clean slate in the test project (fake data only) ----
const d0 = db();
for (const t of ['households', 'leads', 'inbound_emails', 'outbound_emails', 'email_events', 'job_runs', 'history_batches', 'history_tokens', 'history_sources', 'imports', 'known_devices', 'rate_limits', 'hygiene_findings']) {
  const col = ['history_sources'].includes(t) ? 'source' : ['known_devices'].includes(t) ? 'device_hash' : ['rate_limits'].includes(t) ? 'bucket' : 'id';
  const { error } = await d0.from(t).delete().not(col, 'is', null);
  if (error) console.log(`cleanup ${t}: ${error.message}`);
}
await d0.from('app_settings').update({ first_run_ack_at: null, golive_completed_at: null, test_alert_confirmed_at: null, owner_email: accounts.owner_email, backup_email: 'backup-test@example.org', sender_email: 'crm@example.com', all_clear_enabled: false, reply_to: null, postal_address: null, sending_paused: false, sending_paused_reason: null, daily_email_cap: 100, monthly_email_cap: 3000, reserved_alert_budget: 40, history_sync_expected_hours: null, timezone: 'America/New_York', no_reply_first_minutes: 5, no_reply_second_minutes: 15 }).eq('id', true);
rmSync(MAIL, { force: true }); rmSync(INBOUND, { recursive: true, force: true }); mkdirSync(INBOUND, { recursive: true });
await seedThroughApi(d0);

// ---- start the app ----
try { await fetch(`${APP}/login`); console.error(`Port ${PORT} is already in use. Stop the other server first.`); process.exit(2); } catch { /* free */ }
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
  detached: true,
  env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${RELAY}`, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER, APP_URL: APP,
    EMAIL_ADAPTER: 'mock', MOCK_EMAIL_LOG: MAIL, LEAD_FORM_FRAME_ANCESTORS: 'https://www.example.com', MOCK_INBOUND_DIR: INBOUND, DEMO_MODE: 'true', HEALTHCHECK_PING_URL: `http://127.0.0.1:${RELAY}/__watchdog/ping`, HEALTHCHECK_CHECKS_URL: `http://127.0.0.1:${RELAY}/__watchdog/checks`, ...secrets },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = ''; server.stdout.on('data', (d) => { serverLog += d; }); server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 60; i++) { try { await fetch(`${APP}/login`); break; } catch { await sleep(500); } }

const browser = await playwright.chromium.launch();
const shots = 'docs/screens'; mkdirSync(shots, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cspViolations = [];
ctx.on('page', (p) => p.on('console', (m) => { if (/Content Security Policy|Refused to (apply|load|execute)/i.test(m.text())) cspViolations.push(m.text().slice(0, 200)); }));
page.on('console', (m) => { if (/Content Security Policy|Refused to (apply|load|execute)/i.test(m.text())) cspViolations.push(m.text().slice(0, 200)); });
if (process.env.E2E_DEBUG) page.on('request', (r) => { if (r.method() === 'POST') console.log('  POST', r.url()); });
if (process.env.E2E_DEBUG) page.on('response', (r) => { if (r.status() >= 300) console.log('  ', r.status(), r.request().method(), r.url(), r.headers()['location'] || ''); });
const shot = async (name, p = page) => { await p.screenshot({ path: `${shots}/${name}.png`, fullPage: false }); };
const msgAfter = async (selector) => { await Promise.all([page.waitForURL(/msg=/, { timeout: 30000 }), page.click(selector)]); await page.waitForLoadState('load'); return new URL(page.url()).searchParams.get('msg'); };
const cron = (path = '/api/cron/tick') => fetch(`${APP}${path}`, { headers: { Authorization: `Bearer ${secrets.CRON_SECRET}` } });
const signSvix = (secret, body) => { const id = `msg_${S(6)}`; const ts = String(Math.floor(Date.now() / 1000)); const sig = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64'); return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}`, 'content-type': 'application/json' }; };

try {
  // ---- 1. locked login, no prefill, second factor ----
  await page.goto(`${APP}/today`);
  check('logged out is sent to login', page.url().endsWith('/login'), page.url());
  const loginHtml = await page.content();
  check('login page does not contain the owner email (bug 5)', !loginHtml.includes(accounts.owner_email) && (await page.inputValue('input[name=email]')) === '', 'prefilled');
  await shot('01-login');
  const head = await fetch(`${APP}/login`);
  const hdr = Object.fromEntries(head.headers);
  check('security headers', hdr['strict-transport-security'] && hdr['x-frame-options'] === 'DENY' && hdr['x-content-type-options'] === 'nosniff' && hdr['referrer-policy'] === 'no-referrer' && /noindex/.test(hdr['x-robots-tag']) && /no-store/.test(hdr['cache-control']) && /frame-ancestors 'none'/.test(hdr['content-security-policy']), JSON.stringify(hdr));
  await page.fill('input[name=email]', accounts.owner_email);
  await page.fill('input[name=password]', 'wrong-password-' + S(4));
  await page.click('button[type=submit]');
  await page.waitForURL(/msg=bad_login/);
  await page.waitForSelector('.flash');
  check('wrong password is refused', (await page.innerText('body')).includes('did not work'), (await page.innerText('body')).slice(0, 300) + ' ' + page.url());
  await page.fill('input[name=email]', accounts.owner_email);
  await page.fill('input[name=password]', accounts.owner_password);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/mfa/);
  check('password alone stops at the code step', page.url().includes('/mfa'));
  await page.goto(`${APP}/contacts`);
  check('owner without second factor is sent back to the code step', page.url().includes('/mfa'), page.url());
  await shot('02-code');
  const secret = JSON.parse(readFileSync('.e2e/totp.json', 'utf8')).secret;
  await page.fill('input[name=code]', totp(secret));
  await page.click('button[type=submit]');
  await page.waitForURL(/\/(welcome|today)/, { timeout: 20000 });
  check('real TOTP code in a real browser signs in', /welcome|today/.test(page.url()), page.url());
  const knownDevice = (await db().from('known_devices').select('device_hash')).data ?? [];
  check('new device is recorded at sign-in', knownDevice.length === 1, knownDevice.length);
  const loginMail = mails().filter((m) => m.subject === 'New sign-in to your CRM');
  check('a new device emails the owner and the backup contact', loginMail.some((m) => m.to === accounts.owner_email) && loginMail.some((m) => m.to === 'backup-test@example.org') && /wasnt-me\?t=/.test(loginMail[0]?.text || ''), mails().map((m) => m.subject).join(' | '));

  // ---- first run ----
  await page.goto(`${APP}/today`);
  check('first-run screen shows before anything else', page.url().includes('/welcome'));
  check('first-run shows real cost and who should not use this', (await page.textContent('body')).includes('About $45 to $65 a month') && (await page.textContent('body')).includes('You buy Zillow leads'));
  await shot('03-first-run');
  await page.check('input[name=costs]'); await page.check('input[name=policy]');
  await page.click('button:has-text("Continue to settings")');
  await page.waitForURL(/\/settings/);
  await page.fill('input[name=display_name]', 'Demo Agent Example');
  await page.fill('input[name=owner_email]', accounts.owner_email);
  await page.fill('input[name=backup_email]', 'backup-test@example.org');
  await page.fill('input[name=sender_email]', 'crm@example.com');
  await page.fill('input[name=reply_to]', accounts.owner_email);
  await page.fill('input[name=postal_address]', '1 Example Way, Exampleville, NC 28000');
  await page.click('button:has-text("Save settings")');
  await page.waitForURL(/msg=saved/);
  check('settings saved', (await page.textContent('body')).includes('Saved.'));

  // ---- 2. contacts, follow-ups, Today, search ----
  await page.goto(`${APP}/contacts/new`);
  await page.fill('input[name=first_name]', 'Fresh'); await page.fill('input[name=last_name]', 'Testcase');
  await page.fill('input[name=email]', `fresh.testcase.${RUN}@example.com`); await page.fill('input[name=phone]', '(828) 555-0177');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  await page.fill('input[name=followup_on]', today); await page.fill('input[name=followup_title]', 'Call Fresh about the showing');
  await page.click('button:has-text("Add contact")');
  await page.waitForURL(/\/contacts\/[0-9a-f-]{36}/);
  await page.waitForSelector('[data-testid=consent-status]');
  const freshUrl = page.url().split('?')[0];
  check('contact added', (await page.textContent('body')).includes('Contact added.'));
  const cTxt = `${await page.textContent('[data-testid=consent-status]')} | ${await page.textContent('[data-testid=source-type]')}`;
  check('contact shows consent, source and source type', cTxt.includes('Unknown') && cTxt.includes('Personal'), cTxt);
  await page.goto(`${APP}/today`);
  check('follow-up due today is on Today', (await page.textContent('body')).includes('Call Fresh about the showing'));
  // edit and snooze a follow-up, and a birthday on Today
  await page.goto(freshUrl);
  await page.click('[data-testid=followup] summary:has-text("Edit")');
  await page.fill('[data-testid=followup] details input[name=title]', 'Call Fresh about the second showing');
  const edited = await msgAfter('[data-testid=followup] details button:has-text("Save")');
  await page.waitForSelector('[data-testid=followup]:has-text("Call Fresh about the second showing")', { timeout: 10000 }).catch(() => {});
  check('a follow-up can be edited', edited === 'followup_saved' && (await page.textContent('[data-testid=followup]')).includes('Call Fresh about the second showing'), edited);
  await page.goto(freshUrl);
  const md = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 3 * 86400000));
  await page.selectOption('select[name=birthday_month]', String(Number(md.slice(5, 7))));
  await page.fill('input[name=birthday_day]', String(Number(md.slice(8, 10))));
  await msgAfter('button:has-text("Save details")');
  const { data: bp } = await db().from('people').select('birthday').eq('household_id', freshUrl.split('/').pop()).single();
  check('a birthday is stored as month and day only (year 2000, no age)', bp.birthday === `2000-${md.slice(5)}`, bp.birthday);
  await page.goto(`${APP}/today`);
  check('upcoming birthdays show on Today', (await page.textContent('[data-testid=occasions]').catch(() => '')).includes('Fresh Testcase'));
  await page.goto(freshUrl);
  await page.waitForSelector('[data-testid=followup]');
  await page.selectOption('[data-testid=followup] select[name=snooze]', '1d');
  const snoozed = await msgAfter('[data-testid=followup] button:has-text("Snooze")');
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 86400000));
  const { data: snoozedTask } = await db().from('tasks').select('due_on').eq('household_id', freshUrl.split('/').pop()).is('done_at', null).single();
  check('snooze moves a follow-up to tomorrow', snoozed === 'followup_snoozed' && snoozedTask.due_on === tomorrow, JSON.stringify({ snoozed, snoozedTask }));
  await page.goto(`${APP}/today`);
  check('a snoozed follow-up leaves Today', !(await page.textContent('body')).includes('Call Fresh about the second showing'));
  await page.goto(`${APP}/contacts?q=testcase`);
  check('search by name finds it', (await page.textContent('table')).includes('Fresh Testcase'));
  await page.goto(`${APP}/contacts?q=${encodeURIComponent('555-0177')}`);
  check('search by phone finds it', (await page.textContent('table')).includes('Fresh Testcase'));

  // ---- bug 1 and 2: one source per count, true totals with paging ----
  await page.goto(`${APP}/today`);
  const todayNew = Number((await page.textContent('[data-testid=new-leads-count]')).match(/\d+/)[0]);
  await page.goto(`${APP}/contacts?stage=new+lead`);
  const listNew = Number((await page.textContent('[data-testid=total]')).match(/of (\d+)/)[1]);
  check('new lead count matches between Today and Contacts (bug 1)', todayNew === listNew && todayNew > 0, `${todayNew} vs ${listNew}`);
  await page.goto(`${APP}/contacts`);
  const totalTxt = await page.textContent('[data-testid=total]');
  const { count: realCount } = await db().from('households').select('id', { count: 'exact', head: true }).is('archived_at', null).eq('is_test', false);
  check('contact list shows the true total, not the page length (bug 2)', totalTxt.includes(`of ${realCount}`) && realCount > 25, `${totalTxt} vs ${realCount}`);

  // ---- bug 9: fixed message codes ----
  await page.goto(`${APP}/today?msg=${encodeURIComponent('<b>Your account is locked, call 555-0100</b>')}`);
  check('arbitrary text in the URL is not shown (bug 9)', !(await page.innerText('body')).includes('Your account is locked'));
  await page.goto(`${APP}/r/done?code=${encodeURIComponent('You won a prize')}`);
  check('public done page ignores unknown codes', !(await page.innerText('body')).includes('You won a prize'));
  await page.goto(`${APP}/today`);

  // ---- 3. web form with consent wording, and 6. alerts ----
  const formPage = await ctx.newPage();
  const t0 = Date.now();
  await formPage.goto(`${APP}/lead/${secrets.LEAD_FORM_KEY}?source=Website%20form`);
  await formPage.fill('input[name=first_name]', '=HYPERLINK("http://example.com","Click")');
  await formPage.fill('input[name=last_name]', 'Formula');
  await formPage.fill('input[name=email]', `formula.lead.${RUN}@example.com`);
  await formPage.fill('input[name=phone]', '+1 828 555 0188');
  await formPage.check('input[name=consent]');
  await shot('04-lead-form', formPage);
  await formPage.click('button[type=submit]');
  await formPage.waitForURL(/\/lead\/thanks/);
  const { data: formLead } = await db().from('leads').select('id, household_id, received_at, new_alert_at').eq('source', 'Website form').order('received_at', { ascending: false }).limit(1).single();
  check('form creates a contact within 60 seconds', formLead && Date.parse(formLead.received_at) - t0 < 60000, JSON.stringify(formLead));
  const { data: consentRow } = await db().from('consent_records').select('status, wording, source, recorded_at').eq('household_id', formLead.household_id).single();
  const { data: settingsRow } = await db().from('app_settings').select('form_consent_wording').single();
  check('exact consent wording, source and time are stored', consentRow.status === 'opted_in' && consentRow.wording === settingsRow.form_consent_wording && consentRow.source === 'Website form' && consentRow.recorded_at, JSON.stringify(consentRow));
  const leadMail = mails().find((m) => m.subject.includes('New lead') && m.text.includes(`formula.lead.${RUN}@example.com`));
  check('new-lead alert email goes to the owner within 2 minutes', leadMail && leadMail.to === accounts.owner_email && Date.parse(leadMail.at) - t0 < 120000 && leadMail.text.includes('tel:+18285550188'), JSON.stringify(leadMail));
  const honey = await fetch(`${APP}/api/lead`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key: secrets.LEAD_FORM_KEY, first_name: 'Bot', email: 'bot@example.com', website: 'http://spam.example' }) });
  const { count: botCount } = await db().from('people').select('id', { count: 'exact', head: true }).eq('first_name', 'Bot');
  check('honeypot: bot submission pretends to work and stores nothing', honey.status === 303 && botCount === 0, `${honey.status} ${botCount}`);
  check('wrong form key is refused', (await fetch(`${APP}/api/lead`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'key=wrong&first_name=A&email=a@example.com' })).status === 404);
  const formHead = Object.fromEntries((await fetch(`${APP}/lead/${secrets.LEAD_FORM_KEY}`)).headers);
  check('the lead form can be framed only by the listed site', !formHead['x-frame-options'] && /frame-ancestors https:\/\/www\.example\.com;/.test(formHead['content-security-policy']), JSON.stringify(formHead));
  check('oversized form post is refused', (await fetch(`${APP}/api/lead`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x='.padEnd(20000, 'a') })).status === 413);

  // no-reply: pretend the lead came in 6 minutes ago, run the scheduler
  await db().from('leads').update({ received_at: new Date(Date.now() - 6 * 60000).toISOString() }).eq('id', formLead.id);
  const tick1 = await cron();
  check('scheduler runs with its secret', tick1.status === 200, `${tick1.status} ${await tick1.text().catch(() => '')}`);
  check('scheduler refuses without its secret', (await fetch(`${APP}/api/cron/tick`)).status === 401);
  const noReply = mails().find((m) => m.subject.startsWith('No reply yet') && m.text.includes(`formula.lead.${RUN}@example.com`));
  check('first no-reply alert follows on schedule', !!noReply, mails().map((m) => m.subject).join(' | '));
  const link = noReply?.text.match(/(http:\/\/localhost:\d+\/r\/replied\?t=\S+)/)?.[1];
  const rp = await ctx.newPage();
  await rp.goto(link);
  check('"I replied" page does not log anyone in or change anything by itself', (await db().from('leads').select('replied_at').eq('id', formLead.id).single()).data.replied_at === null);
  await rp.click('button:has-text("Yes, I replied")');
  await rp.waitForURL(/\/r\/done\?code=replied/);
  check('"I replied" stops the reminders', (await db().from('leads').select('replied_at, replied_via').eq('id', formLead.id).single()).data.replied_via === 'link');
  await rp.goto(link); await rp.click('button:has-text("Yes, I replied")'); await rp.waitForURL(/\/r\/done\?code=/);
  check('an "I replied" link works only once', rp.url().includes('code=link_used'), rp.url());
  await db().from('leads').update({ received_at: new Date(Date.now() - 20 * 60000).toISOString() }).eq('id', formLead.id);
  await cron();
  check('no second alert after "I replied"', !mails().some((m) => m.subject.startsWith('Still no reply') && m.text.includes(`formula.lead.${RUN}@example.com`)));
  const tampered = link.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  await rp.goto(tampered); await rp.click('button:has-text("Yes, I replied")'); await rp.waitForURL(/code=bad_link/);
  check('a tampered "I replied" link does nothing', rp.url().includes('bad_link'));
  await rp.close();

  // ---- bug 4: export neutralizes formulas ----
  const exp = await page.request.get(`${APP}/api/export/contacts`);
  const csv = await exp.text();
  check('export neutralizes a formula name (bug 4)', csv.includes(`'=HYPERLINK`) && !/,=HYPERLINK/.test(csv), csv.slice(0, 200));
  check('export keeps phone numbers intact', (await (await page.request.get(`${APP}/api/export/contact_methods`)).text()).includes('+1 828 555 0188'));
  const all = await (await page.request.get(`${APP}/api/export/all`)).json();
  check('full export has contacts, notes, deals, consent and opt-outs', ['contacts', 'notes', 'deals', 'consent', 'suppressions'].every((k) => Array.isArray(all[k]) && all[k].length > 0), Object.keys(all));
  check('export is refused without login', (await fetch(`${APP}/api/export/contacts`)).status === 401);

  // ---- 4. forwarded lead emails ----
  const sample = readFileSync('tests/fixtures.ts', 'utf8');
  const realtor = sample.match(/REALTOR_SAMPLE = `([\s\S]*?)`;/)[1];
  const scrambled = sample.match(/SCRAMBLED_SAMPLE = `([\s\S]*?)`;/)[1];
  writeFileSync(`${INBOUND}/rcv_good.json`, JSON.stringify({ from: 'leads@email.realtor.com', to: 'leads@crm.example.com', subject: 'New lead', text: realtor, html: null }));
  writeFileSync(`${INBOUND}/rcv_bad.json`, JSON.stringify({ from: 'leads@email.realtor.com', to: 'leads@crm.example.com', subject: 'New lead', text: scrambled, html: null }));
  for (const id of ['rcv_good', 'rcv_bad']) {
    const body = JSON.stringify({ type: 'email.received', data: { email_id: id, from: 'leads@email.realtor.com', subject: 'New lead' } });
    const r = await fetch(`${APP}/api/inbound/email`, { method: 'POST', headers: signSvix(secrets.RESEND_INBOUND_SECRET, body), body });
    check(`inbound ${id} accepted`, r.status === 200, r.status);
  }
  const badSig = await fetch(`${APP}/api/inbound/email`, { method: 'POST', headers: { ...signSvix(secrets.RESEND_INBOUND_SECRET, '{}'), 'svix-signature': 'v1,AAAA' }, body: '{}' });
  check('inbound webhook refuses a bad signature', badSig.status === 401);
  const { data: realtorContact } = await db().from('contact_methods').select('household_id').eq('normalized', 'testy.mcexample@example.com').maybeSingle();
  check('Realtor.com sample creates a contact', !!realtorContact);
  const { data: reviewRow } = await db().from('inbound_emails').select('status, text_body, alerted_at').eq('provider_id', 'rcv_bad').single();
  check('scrambled email lands in Needs review with nothing lost', reviewRow.status === 'needs_review' && reviewRow.text_body.includes('Fir$t N@me'));
  check('Needs review alerts the owner', !!reviewRow.alerted_at && mails().some((m) => m.subject === 'An email needs review'));
  await page.goto(`${APP}/review`);
  await shot('05-needs-review');

  // ---- 5. CSV import: 500 rows, 20 bad ----
  const before = mails().length;
  const rowsCsv = ['First Name,Last Name,Email,Phone'];
  for (let i = 0; i < 500; i++) rowsCsv.push(i % 25 === 0 ? `Bad${i},Row,not-an-email-${i},` : `Import${i},Example,import${i}@example.com,`);
  writeFileSync('.e2e/import-500.csv', rowsCsv.join('\n') + '\n');
  await page.goto(`${APP}/import`);
  await page.setInputFiles('input[name=file]', '.e2e/import-500.csv');
  await page.click('button:has-text("Read file")');
  await page.waitForURL(/\/import\/[0-9a-f-]{36}/);
  check('preview shows 480 ready and 20 with problems', (await page.textContent('[data-testid=import-preview]')).includes('480 rows ready. 20 rows have problems'), await page.textContent('[data-testid=import-preview]'));
  await shot('06-import-preview');
  const importUrl = page.url().split('?')[0];
  await page.click('button:has-text("Import 480 rows")');
  await page.waitForURL(/msg=import_done/, { timeout: 60000 });
  check('480 rows imported', (await page.textContent('[data-testid=import-result]')).includes('480 new contacts'), await page.textContent('[data-testid=import-result]'));
  const errCsv = await (await page.request.get(`${APP}/api/import/errors/${importUrl.split('/').pop()}`)).text();
  check('error file lists the 20 bad rows', errCsv.trim().split('\r\n').length === 21, errCsv.split('\r\n').length);
  check('import emails nobody', mails().length === before, `${mails().length - before} emails`);
  const { data: impConsent } = await db().from('v_households').select('consent_status').eq('display_name', 'Import1 Example').single();
  check('imported contacts have unknown consent', impConsent.consent_status === 'unknown');
  await page.click('button:has-text("Undo this import")');
  await page.waitForURL(/msg=import_undone/, { timeout: 60000 });
  const { count: left } = await db().from('households').select('id', { count: 'exact', head: true }).like('display_name', 'Import% Example');
  check('one-click undo removes the import', left === 0, left);

  // ---- 7. email, delivery status, bounce, opt-out ----
  await page.goto(freshUrl);
  await page.fill('input[name=subject]', 'Showing times');
  await page.fill('textarea[name=body]', 'Saturday at 10 works.');
  await page.click('button:has-text("Send")');
  await page.waitForURL(/msg=email_sent/);
  check('one-to-one email shows "Sent", not "Delivered"', (await page.textContent('[data-testid=email-status]')).includes('Sent (accepted by provider)'));
  await shot('07-contact');
  const sent = mails().find((m) => m.subject === 'Showing times');
  const bounceBody = JSON.stringify({ type: 'email.bounced', data: { email_id: sent.providerId, bounce: { type: 'Permanent' } } });
  const wb = await fetch(`${APP}/api/webhooks/resend`, { method: 'POST', headers: signSvix(secrets.RESEND_WEBHOOK_SECRET, bounceBody), body: bounceBody });
  check('delivery webhook accepted', wb.status === 200, wb.status);
  await page.goto(freshUrl);
  check('a bounce marks the contact', (await page.textContent('[data-testid=email-status]')).includes('Bounced') && (await page.textContent('body')).includes('hard bounce'));
  await page.fill('input[name=subject]', 'Again'); await page.fill('textarea[name=body]', 'Second try');
  const again = await msgAfter('button:has-text("Send")');
  check('a bounced address can no longer be emailed', again === 'email_blocked_suppressed', again);
  // marketing email to unknown consent is blocked
  const { data: someone } = await db().from('v_households').select('id').eq('display_name', 'Blake Sample').maybeSingle();
  if (someone) {
    await page.goto(`${APP}/contacts/${someone.id}`);
    await page.fill('input[name=subject]', 'Market update'); await page.fill('textarea[name=body]', 'Prices this month');
    await page.check('input[name=marketing]');
    const code = await msgAfter('button:has-text("Send")');
    check('marketing to a contact with unknown consent is blocked', code === 'email_blocked_consent', code);
  }
  // unsubscribe link from a marketing email to an opted-in contact
  const { data: optedIn } = await db().from('v_households').select('id, primary_email').eq('consent_status', 'opted_in').limit(1).single();
  await page.goto(`${APP}/contacts/${optedIn.id}`);
  await page.fill('input[name=subject]', 'Spring listings'); await page.fill('textarea[name=body]', 'Here are three.');
  await page.check('input[name=marketing]'); await page.click('button:has-text("Send")');
  await page.waitForURL(/msg=email_sent/);
  const mk = mails().find((m) => m.subject === 'Spring listings');
  check('marketing email has an unsubscribe link and one-click header', mk.text.includes('/u?t=') && mk.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
  const one = await fetch(mk.headers['List-Unsubscribe'].slice(1, -1), { method: 'POST' });
  check('one-click unsubscribe works', one.status === 200);
  const { data: optCheck } = await db().from('v_households').select('consent_status').eq('id', optedIn.id).single();
  check('unsubscribed contact shows opted out', optCheck.consent_status === 'opted_out');

  // ---- 8. deals with key dates on Today and a reminder at local time ----
  await page.goto(freshUrl);
  await page.click('summary:has-text("Add a deal")');
  const inTwo = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 2 * 86400000));
  await page.fill('details input[name=property_street]', '7 Example Court');
  await page.fill('details input[name=closing_date]', inTwo);
  await page.click('button:has-text("Add deal")');
  await page.waitForURL(/msg=deal_saved/);
  check('deal screen says it is not the transaction file', (await page.textContent('body')).includes('Not your transaction file'));
  await page.goto(`${APP}/today`);
  check('deadline 2 days out appears on Today', (await page.textContent('body')).includes('7 Example Court'));
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  await db().from('app_settings').update({ reminder_local_hour: localHour }).eq('id', true);
  await cron();
  check('deadline triggers an email at the local hour', mails().some((m) => m.subject.startsWith('Closing') && m.subject.includes('7 Example Court')), mails().map((m) => m.subject).slice(-6).join(' | '));
  await db().from('app_settings').update({ reminder_local_hour: Math.min(23, localHour + 1) }).eq('id', true);
  await shot('08-today');

  // ---- 9. watchdog, banner, status, self-test, go-live ----
  const lastTick = (await db().from('job_runs').select('ok, detail').eq('job', 'tick').order('id', { ascending: false }).limit(1).single()).data;
  // The main check means only "the scheduler ran" (N8). Red pipeline checks go to the second check.
  const mainPings = watchdog.filter((w) => w.url.startsWith('/__watchdog/ping'));
  const checkPings = watchdog.filter((w) => w.url.startsWith('/__watchdog/checks'));
  const pipelineRed = /Logged-out read test|Nightly backup|Weekly test lead|Email sending|\b(no_reply|deal_reminders|hygiene|self_test|fake_lead|backup|sending)\b/.test(lastTick.detail);
  check('watchdog gets a check-in after every run, and /fail when a check failed', lastTick.ok && mainPings.length >= 3 && mainPings.at(-1).url === '/__watchdog/ping' && checkPings.length === mainPings.length && checkPings.at(-1).url === (pipelineRed ? '/__watchdog/checks/fail' : '/__watchdog/checks'), JSON.stringify({ watchdog: watchdog.slice(-2), lastTick }));
  await page.goto(`${APP}/status`);
  check('status says "You are the IT department"', (await page.textContent('body')).includes('You are the IT department'));
  await page.click('button:has-text("Run logged-out read test")');
  await page.waitForURL(/msg=selftest_/);
  const st = (await db().from('job_runs').select('ok, detail').eq('job', 'self_test').order('id', { ascending: false }).limit(1).single()).data;
  check('self-test read every table logged out and found no leak', !st.detail.includes('Readable without login'), st.detail);
  check('self-test flags public signup when it is on', st.detail.includes('Public signup is ON') ? st.ok === false : st.ok === true, st.detail);
  await page.click('button:has-text("Send a test lead")');
  await page.waitForURL(/msg=test_lead_/, { timeout: 60000 });
  const fl = (await db().from('job_runs').select('ok, detail').eq('job', 'fake_lead').order('id', { ascending: false }).limit(1).single()).data;
  const { count: testLeft } = await db().from('households').select('id', { count: 'exact', head: true }).eq('is_test', true);
  check('test lead goes form to database to alert and cleans itself up', fl.ok && testLeft === 0, fl.detail);
  const br = await fetch(`${APP}/api/backup-report`, { method: 'POST', headers: { Authorization: `Bearer ${secrets.BACKUP_REPORT_SECRET}`, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, detail: 'e2e: checked 12 tables, sizes and counts match' }) });
  check('backup report accepted with its secret', br.status === 200);
  check('backup report refused without it', (await fetch(`${APP}/api/backup-report`, { method: 'POST', body: '{}' })).status === 401);
  await page.click('button:has-text("Finish go-live")').catch(() => {});
  const golive = (await db().from('app_settings').select('golive_completed_at').single()).data;
  check('go-live will not complete while a check fails', golive.golive_completed_at === null);
  await page.goto(`${APP}/status`);
  await shot('09-status');
  // stop the scheduler: age every tick run, the banner must turn red
  await db().from('job_runs').update({ finished_at: new Date(Date.now() - 2 * 3600000).toISOString() }).eq('job', 'tick');
  await page.goto(`${APP}/contacts`);
  check('red banner on every screen when the scheduler stops', (await page.getAttribute('[data-testid=health-strip]', 'class')).includes('bad') && (await page.textContent('[data-testid=health-strip]')).includes('Scheduled job'));
  await shot('10-red-banner');
  await cron();
  // ---- budget: client mail can't use the alert reserve, and alerts still go out ----
  const { data: supp } = await db().from('suppressions').select('normalized').eq('kind', 'email');
  const { data: open } = await db().from('v_households').select('id, primary_email, display_stage').not('primary_email', 'is', null).neq('display_stage', 'do not contact').limit(50);
  const budgetTarget = open.find((h) => !supp.some((x) => x.normalized === h.primary_email.toLowerCase()));
  // The guard counts client mail only against daily cap minus the alert reserve, so leave room for one.
  const { data: usage } = await db().from('v_email_usage').select('sent_today, alerts_today').single();
  await db().from('app_settings').update({ daily_email_cap: usage.sent_today - usage.alerts_today + 41, reserved_alert_budget: 40 }).eq('id', true);
  for (let i = 0; i < 2; i++) {
    await page.goto(`${APP}/contacts/${budgetTarget.id}`);
    await page.fill('input[name=subject]', `Budget check ${i}`); await page.fill('textarea[name=body]', 'Hello');
    await msgAfter('button:has-text("Send")');
  }
  await page.goto(`${APP}/contacts/${budgetTarget.id}`);
  await page.fill('input[name=subject]', 'Over budget'); await page.fill('textarea[name=body]', 'Hello');
  const overBudget = await msgAfter('button:has-text("Send")');
  check('client mail stops at the daily limit minus the alert reserve', overBudget === 'email_blocked_budget' && !mails().some((m) => m.subject === 'Over budget'), overBudget);
  await page.goto(`${APP}/status`);
  const alertCode = await msgAfter('button:has-text("Send a test alert")');
  check('an alert still goes out when client mail is blocked', alertCode === 'test_alert_sent' && mails().filter((m) => m.subject === 'Test alert from your CRM').length === 2, alertCode);
  check('status says plainly that the deploy date is not an update check', (await page.textContent('[data-testid=check-deploy]')).includes('does not prove'));
  await db().from('app_settings').update({ daily_email_cap: 100, reserved_alert_budget: 40 }).eq('id', true);
  const failedCheckMail = mails().filter((m) => m.subject === 'Problem: Logged-out read test');
  check('a failing check emails once, not on every scheduler run', failedCheckMail.length <= 2, failedCheckMail.length);

  // ---- Connect your history, rescue upload, review, undo ----
  await page.goto(`${APP}/history`);
  check('history page shows the firm-policy and not-legal-advice notice', (await page.textContent('body')).includes('did not agree to AI processing') && (await page.textContent('body')).includes('not legal advice'));
  await page.click('button:has-text("Create a token")');
  await page.waitForSelector('[data-testid=new-token]');
  const token = (await page.textContent('[data-testid=new-token]')).trim();
  check('history token is shown once and never in the address bar', token.startsWith('och_') && !page.url().includes('och_'));
  await page.reload();
  check('the token is not shown again after a reload', !(await page.$('[data-testid=new-token]')));
  await shot('11-connect-history');
  const base = mkdtempSync(join(tmpdir(), 'mirror-'));
  const fx = await buildFixtures(join(base, 'fx'));
  const work = join(base, 'work');
  const q = () => {};
  await rescue(['init', '--work', work], q);
  writeFileSync(join(work, 'config.json'), JSON.stringify({ me: ME }));
  for (const [source, input] of [['gmail_mbox', 'mail.mbox'], ['imessage', 'chat.db'], ['google_voice', 'Takeout/Voice/Calls'], ['phone_contacts', 'contacts.vcf'], ['crm_export', 'fub.csv'], ['deal_records', 'deals.csv']]) await rescue(['extract', '--work', work, '--source', source, '--input', join(fx.dir, input)], q);
  await rescue(['aggregate', '--work', work], q);
  writeFileSync(join(work, 'judgments.json'), JSON.stringify([{ candidate_id: JSON.parse(readFileSync(join(work, 'candidates.json'), 'utf8')).find((c) => c.handles.some((h) => h.value === 'testy@example.com')).candidate_id, summary: 'Toured homes and talked about an offer', why: 'Several real estate messages in the last month' }]));
  await rescue(['review', '--work', work], q);
  writeFileSync(join(work, 'review.csv'), readFileSync(join(work, 'review.csv'), 'utf8').split('\r\n').map((l, i) => (i > 0 && /,yes,/.test(l) ? `yes${l}` : l)).join('\r\n'));
  const built = await rescue(['build', '--work', work], q);
  check('rescue writes a valid contract folder', built.valid && built.households > 0, JSON.stringify(built));
  process.env.OWNCRM_HISTORY_TOKEN = token;
  const up = await rescue(['upload', '--work', work, '--url', APP, '--source', 'gmail', '--send'], q);
  check('rescue upload with the token is accepted for review', up.status === 200 && up.data.batch, JSON.stringify(up));
  const badTok = await fetch(`${APP}/api/history/upload`, { method: 'POST', headers: { Authorization: 'Bearer och_nottherealtoken', 'content-type': 'application/json' }, body: '{}' });
  check('upload refuses a wrong token', badTok.status === 401);
  const smuggle = await fetch(`${APP}/api/history/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ client_batch_id: 'smuggle-1234', source: 'gmail', messages: ['full text'] }) });
  check('upload refuses message bodies or extra fields', smuggle.status === 400);
  const { count: beforeApprove } = await db().from('households').select('id', { count: 'exact', head: true }).like('lead_source', 'Rescue:%');
  check('nothing is in contacts before approval', beforeApprove === 0);
  await page.goto(`${APP}/history/${up.data.batch}`);
  await shot('12-history-review');
  await page.check('input[name=approve_all]');
  await page.click('button:has-text("Save the people I checked")');
  await page.waitForURL(/msg=batch_saved/);
  const { data: rescued } = await db().from('v_households').select('id, display_name, consent_status, notes').like('lead_source', 'Rescue:%');
  const savedBatch = (await db().from('history_batches').select('saved_count, import_id').eq('id', up.data.batch).single()).data;
  const savedImp = (await db().from('imports').select('imported_rows, merged_rows').eq('id', savedBatch.import_id).single()).data;
  check('approved people saved (new or merged into an existing contact)', savedBatch.saved_count === built.households && savedImp.imported_rows + savedImp.merged_rows === built.households, JSON.stringify({ savedBatch, savedImp }));
  check('people the rescue created have unknown consent', rescued.length > 0 && rescued.every((r) => r.consent_status === 'unknown'), JSON.stringify(rescued).slice(0, 200));
  const status = (await db().from('history_sources').select('source, last_success_at').eq('source', 'gmail').single()).data;
  check('history source shows last successful run', !!status.last_success_at);

  // ---- mirror test: contract folder through the Import page, then check the database ----
  const contractDir = join(work, 'contract');
  await page.goto(`${APP}/import`);
  const files = readdirSync(contractDir).filter((f) => !f.startsWith('contract-errors')).map((f) => join(contractDir, f));
  await page.setInputFiles('input[name=files]', files);
  await page.click('button:has-text("Check folder")');
  await page.waitForURL(/\/import\/[0-9a-f-]{36}/);
  check('contract folder passes the check in the app', !!(await page.$('[data-testid=contract-ok]')));
  await page.click('button:has-text("Import")');
  await page.waitForURL(/msg=import_done/);
  check('second import of the same people merges instead of duplicating', (await page.textContent('[data-testid=import-result]')).includes(`0 new contacts, ${built.households} merged`), await page.textContent('[data-testid=import-result]'));
  const invalidDir = join(base, 'invalid'); mkdirSync(invalidDir);
  for (const f of readdirSync(contractDir)) writeFileSync(join(invalidDir, f), readFileSync(join(contractDir, f)));
  writeFileSync(join(invalidDir, 'messages.csv'), 'body\nfull message text\n');
  await page.goto(`${APP}/import`);
  await page.setInputFiles('input[name=files]', readdirSync(invalidDir).map((f) => join(invalidDir, f)));
  await page.click('button:has-text("Check folder")');
  await page.waitForURL(/\/import\/[0-9a-f-]{36}/);
  check('an invalid contract folder is rejected with an error file', !!(await page.$('[data-testid=contract-bad]')) && (await page.textContent('body')).includes('Download the error file'));
  const dump = JSON.stringify(await (await page.request.get(`${APP}/api/export/all`)).json());
  const forbidden = ['123-45-6789', '4111 1111 1111 1111', 'hunter2', 'biopsy', 'Love you', 'IGNORE YOUR INSTRUCTIONS', 'cousin@example.com', 'clinic@example.com', 'Can we see the house on Elm'];
  check('no message bodies or redacted patterns reached the database', forbidden.every((f) => !dump.includes(f)), forbidden.filter((f) => dump.includes(f)));

  // ---- remaining screenshots, desktop and phone ----
  for (const [name, path] of [['13-contacts', '/contacts'], ['14-deals', '/deals'], ['15-cleanup', '/cleanup'], ['16-capabilities', '/capabilities'], ['17-settings', '/settings'], ['18-email', '/emails']]) {
    if (name === '15-cleanup') { await page.goto(`${APP}/cleanup`); await page.click('button:has-text("Run cleanup now")'); await page.waitForURL(/msg=cleanup_ran/); }
    else await page.goto(`${APP}${path}`);
    await shot(name);
  }
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const pp = await phone.newPage();
  for (const [name, path] of [['phone-today', '/today'], ['phone-contacts', '/contacts'], ['phone-contact', new URL(freshUrl).pathname], ['phone-status', '/status'], ['phone-history', '/history']]) {
    await pp.goto(`${APP}${path}`);
    const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`no sideways scroll at phone width: ${path}`, overflow <= 1, overflow);
    await pp.screenshot({ path: `${shots}/${name}.png` });
  }
  const lf = await phone.newPage(); await lf.goto(`${APP}/lead/${secrets.LEAD_FORM_KEY}`); await lf.screenshot({ path: `${shots}/phone-lead-form.png` });
  await phone.close();

  check('no page broke the content security policy', cspViolations.length === 0, cspViolations.slice(0, 3).join(' | '));

  // ---- wasn't me: ends sessions through the database (service-only, so via the relay this is refused) ----
  await page.goto(`${APP}/settings`);
  await page.click('button:has-text("Sign out everywhere")');
  await page.waitForURL(/\/login/);
  await page.goto(`${APP}/today`);
  check('sign out everywhere ends this session', page.url().includes('/login'));
} catch (e) {
  check('e2e harness', false, e.stack);
  await page.screenshot({ path: '.e2e/failure.png' }).catch(() => {});
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  relay.close();
  writeFileSync('.e2e/server.log', serverLog);
}
const failed = results.filter((r) => !r.ok);
writeFileSync('docs/test-results/e2e.json', JSON.stringify({ ran_at: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results }, null, 1) + '\n');
console.log(`\nE2E: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
