import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { getSettings, type Settings } from './settings';
import { leadAlertText, sendAlert } from './alerts';
import { dealReminderDue, noReplyDue } from './logic';
import { localDate, localHour, localWeekday, weekStart, formatDate } from './time';
import { lastSuccess, lastFinished, runJob } from './jobs';
import { loadHealth } from './health-load';
import { failingChecks, type Check } from './health';

export type TickDeps = {
  db: SupabaseClient; adapter: EmailAdapter; appUrl: string; linkSecret?: string; now: Date;
  healthcheckUrl?: string; selfTest: () => Promise<{ ok: boolean; detail: string }>;
  fakeLead: () => Promise<{ ok: boolean; detail: string }>;
};

async function noReplyAlerts(d: TickDeps, s: Settings) {
  const since = new Date(d.now.getTime() - 3 * 86400000).toISOString();
  const { data: leads } = await d.db.from('leads').select('id, household_id, source, received_at, first_alert_at, second_alert_at, replied_at, message')
    .is('replied_at', null).eq('is_test', false).gte('received_at', since).limit(200);
  let sent = 0;
  for (const lead of leads ?? []) {
    const due = noReplyDue(lead, s.no_reply_first_minutes, s.no_reply_second_minutes, d.now);
    if (!due) continue;
    const { data: h } = await d.db.from('v_households').select('display_name, primary_phone, primary_email').eq('id', lead.household_id).single();
    const r = await sendAlert(d.db, d.adapter, s, d.appUrl, {
      subject: `${due === 'first' ? 'No reply yet' : 'Still no reply'}: ${h?.display_name ?? 'new lead'}`,
      text: leadAlertText(d.appUrl, d.linkSecret, lead, { name: h?.display_name ?? 'Unknown', phone: h?.primary_phone, email: h?.primary_email, message: lead.message }, due),
      alsoBackup: due === 'second', leadId: lead.id, householdId: lead.household_id,
    });
    if (r.ok) {
      await d.db.from('leads').update(due === 'first' ? { first_alert_at: d.now.toISOString() } : { second_alert_at: d.now.toISOString(), first_alert_at: lead.first_alert_at ?? d.now.toISOString() }).eq('id', lead.id);
      sent++;
    }
  }
  // A new-lead alert that failed at intake gets another try here.
  const { data: missed } = await d.db.from('leads').select('id, household_id, source').is('new_alert_at', null).eq('is_test', false).gte('received_at', since).limit(50);
  for (const lead of missed ?? []) {
    const { data: h } = await d.db.from('v_households').select('display_name, primary_phone, primary_email').eq('id', lead.household_id).single();
    const r = await sendAlert(d.db, d.adapter, s, d.appUrl, { subject: `New lead: ${h?.display_name ?? ''}`, text: leadAlertText(d.appUrl, d.linkSecret, lead, { name: h?.display_name ?? 'Unknown', phone: h?.primary_phone, email: h?.primary_email }, 'new'), leadId: lead.id, householdId: lead.household_id });
    if (r.ok) { await d.db.from('leads').update({ new_alert_at: d.now.toISOString() }).eq('id', lead.id); sent++; }
  }
  return { ok: true, detail: `${sent} lead alerts sent.` };
}

async function dealReminders(d: TickDeps, s: Settings) {
  const today = localDate(d.now, s.timezone);
  const { data: dates } = await d.db.from('v_today_deal_dates').select('id').limit(500);
  const ids = (dates ?? []).map((x: any) => x.id);
  if (!ids.length) return { ok: true, detail: 'No key dates in the next 7 days.' };
  const { data: rows } = await d.db.from('deal_dates').select('id, label, due_on, reminded_7_at, reminded_2_at, reminded_0_at, deals(property_street, household_id, households(display_name))').in('id', ids);
  let sent = 0;
  for (const dd of rows ?? []) {
    const field = dealReminderDue(dd, d.now, s.timezone, s.reminder_local_hour);
    if (!field) continue;
    const deal: any = dd.deals;
    const when = dd.due_on === today ? 'today' : dd.due_on < today ? `overdue since ${formatDate(dd.due_on)}` : `on ${formatDate(dd.due_on)}`;
    const r = await sendAlert(d.db, d.adapter, s, d.appUrl, {
      subject: `${dd.label} ${when}: ${deal?.property_street || deal?.households?.display_name || 'deal'}`.slice(0, 200),
      text: `${dd.label} is ${when}.\nDeal: ${deal?.property_street || 'no address'} (${deal?.households?.display_name || ''})\nOpen it: ${d.appUrl}/contacts/${deal?.household_id}\n\nDates are what you entered. Check them against your contract and your firm's file.`,
      householdId: deal?.household_id,
    });
    if (r.ok) { await d.db.from('deal_dates').update({ [field]: d.now.toISOString() }).eq('id', dd.id); sent++; }
  }
  return { ok: true, detail: `${sent} key date reminders sent.` };
}

// A failed job is retried, but not on every 5-minute tick: at most once per retry window.
// Without this, one failing weekly check reran (and emailed) every few minutes.
const RETRY_HOURS = { daily: 1, weekly: 6 };
async function retryWait(db: SupabaseClient, job: string, now: Date, hours: number) {
  const last = await lastFinished(db, job);
  return !!last && now.getTime() - Date.parse(last) < hours * 3600000;
}
async function dueOncePerDay(db: SupabaseClient, job: string, s: Settings, now: Date, hour: number) {
  if (localHour(now, s.timezone) < hour) return false;
  const last = await lastSuccess(db, job);
  const due = !last || localDate(new Date(last), s.timezone) !== localDate(now, s.timezone);
  return due && !(await retryWait(db, job, now, RETRY_HOURS.daily));
}
async function dueOncePerWeek(db: SupabaseClient, job: string, s: Settings, now: Date, hour: number) {
  if (localHour(now, s.timezone) < hour) return false;
  const last = await lastSuccess(db, job);
  const due = !last || weekStart(localDate(new Date(last), s.timezone)) !== weekStart(localDate(now, s.timezone));
  return due && !(await retryWait(db, job, now, RETRY_HOURS.weekly));
}

// Checks whose failure also goes to the backup contact.
const ESCALATE = new Set(['backup', 'watchdog', 'self_test', 'fake_lead', 'sending']);
// What to do, in one line, for each red check. The same words are in HOW-TO.md.
export const CHECK_FIX: Record<string, string> = {
  tick: 'The scheduler stopped. Check the Cron Jobs tab in Vercel and that your plan allows a 5-minute schedule.',
  watchdog: 'The app could not reach the outside watchdog. Check HEALTHCHECK_PING_URL in Vercel.',
  backup: 'The nightly backup stopped or failed. Open the Actions tab of your GitHub repository and read the last "Nightly backup" run.',
  self_test: 'The logged-out read test failed. If it says public signup is on, turn it off in Supabase. If a table is readable, stop and get help.',
  fake_lead: 'The weekly test lead did not make it through. Send a test lead from Status and read what it says.',
  domain_check: 'Your sending domain lost its DNS records. Open Resend, Domains, and fix the records it shows.',
  sending: 'Sending is paused after bounces or a complaint. Read the reason on Status before turning it back on.',
  quota: 'You are close to your email allowance. Check for a loop or spam on your form, or raise your plan.',
  db_size: 'The database is almost full. Export old data or move to a bigger plan.',
  history_sync: 'The history sync on your computer has not checked in. It only runs when that computer is on and signed in.',
};

async function alertFailingChecks(d: TickDeps, s: Settings, checks: Check[]) {
  let sent = 0;
  for (const c of failingChecks(checks)) {
    if (c.key === 'tick') continue; // The scheduler is running right now. The watchdog reports silence.
    const r = await sendAlert(d.db, d.adapter, s, d.appUrl, {
      subject: `Problem: ${c.label}`, key: `check:${c.key}`, alsoBackup: ESCALATE.has(c.key),
      text: `${c.label} is red.\n\nWhat it says: ${c.detail}\nWhat to do: ${CHECK_FIX[c.key] ?? 'Open Status for details.'}\n\nOpen Status: ${d.appUrl}/status\n\nYou get this once every 12 hours while it stays red.`,
    }, d.now);
    sent += r.sent;
  }
  return sent;
}

function ago(iso: string | null | undefined, now: Date) {
  if (!iso) return 'never';
  const h = (now.getTime() - Date.parse(iso)) / 3600000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} minutes ago` : h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`;
}

export async function runTick(d: TickDeps) {
  const outcomes: Record<string, boolean> = {};
  const tick = await runJob(d.db, 'tick', async () => {
    const s = await getSettings(d.db);
    outcomes.no_reply = (await runJob(d.db, 'no_reply_alerts', () => noReplyAlerts(d, s))).ok;
    outcomes.deal_reminders = (await runJob(d.db, 'deal_reminders', () => dealReminders(d, s))).ok;

    if (await dueOncePerDay(d.db, 'domain_check', s, d.now, 0)) {
      outcomes.domain = (await runJob(d.db, 'domain_check', async () => {
        const domain = String(s.sender_email || '').split('@')[1];
        if (!domain) return { ok: false, detail: 'No sender address in Settings.' };
        const v = await d.adapter.domainVerified(domain);
        return v ? { ok: true, detail: `${domain} is verified.` } : { ok: false, detail: v === false ? `${domain} is not verified. Check your DNS records.` : 'Could not reach the email provider.' };
      })).ok;
    }
    if (await dueOncePerWeek(d.db, 'hygiene', s, d.now, 6)) {
      outcomes.hygiene = (await runJob(d.db, 'hygiene', async () => {
        const { data, error } = await d.db.rpc('run_hygiene');
        if (error) return { ok: false, detail: error.message };
        return { ok: true, detail: `Cleanup added ${data.added} and closed ${data.fixed} findings.` };
      })).ok;
    }
    if (await dueOncePerWeek(d.db, 'self_test', s, d.now, 6)) {
      outcomes.self_test = (await runJob(d.db, 'self_test', d.selfTest)).ok;
    }
    if (s.weekly_fake_lead_enabled && localWeekday(d.now, s.timezone) === 'Mon' && await dueOncePerWeek(d.db, 'fake_lead', s, d.now, 7)) {
      outcomes.fake_lead = (await runJob(d.db, 'fake_lead', d.fakeLead)).ok;
    }
    // Every red check on Status, not just the jobs that ran in this tick: a backup that stopped
    // days ago, a watchdog that can't be reached, a failed self-test. One email per check per
    // 12 hours, inside the alert budget.
    const checks = await loadHealth(d.db, s);
    const red = failingChecks(checks).filter((c) => c.key !== 'tick');
    for (const c of red) outcomes[`check:${c.key}`] = false;
    await alertFailingChecks(d, s, checks);

    if (s.all_clear_enabled && await dueOncePerDay(d.db, 'all_clear', s, d.now, s.all_clear_local_hour)) {
      await runJob(d.db, 'all_clear', async () => {
        const failedJobs = Object.entries(outcomes).filter(([k, v]) => !v && !k.startsWith('check:')).map(([k]) => k);
        const problems = [...red.map((c) => `${c.label}: ${c.detail}`), ...failedJobs.map((k) => `${k} failed in this run`)];
        const backup = checks.find((c) => c.key === 'backup');
        const watchdog = checks.find((c) => c.key === 'watchdog');
        const facts = [
          `Last backup: ${ago(backup?.lastSuccessAt, d.now)}.`,
          `Outside watchdog: ${watchdog?.state === 'not_set_up' ? 'not set up yet' : `last check-in ${ago(watchdog?.lastSuccessAt, d.now)}`}.`,
          `Checks on Status that are red: ${red.length}.`,
        ].join('\n');
        const r = await sendAlert(d.db, d.adapter, s, d.appUrl, {
          subject: problems.length ? 'Daily check: something needs attention' : 'Daily check: all clear',
          text: problems.length
            ? `These need attention:\n- ${problems.join('\n- ')}\n\n${facts}\n\nOpen Status: ${d.appUrl}/status`
            : `Every check on Status is working.\n\n${facts}\n\nIf this email ever does not arrive by ${s.all_clear_local_hour}:15, something is wrong. Open Status: ${d.appUrl}/status`,
        }, d.now);
        return { ok: r.ok, detail: r.ok ? 'Daily all-clear sent.' : 'Could not send the daily all-clear.' };
      });
    }
    await d.db.from('job_runs').delete().lt('started_at', new Date(d.now.getTime() - 90 * 86400000).toISOString());
    await d.db.from('rate_limits').delete().lt('window_start', new Date(d.now.getTime() - 86400000).toISOString());
    const failed = Object.entries(outcomes).filter(([, v]) => !v).map(([k]) => k);
    // The scheduler itself ran. Failed checks show on their own rows and go to the watchdog.
    return { ok: true, detail: failed.length ? `Ran. These checks failed: ${failed.join(', ')}` : 'All scheduled work ran.', value: failed };
  });
  const anyFailed = !tick.ok || ((tick.value as string[] | undefined)?.length ?? 0) > 0;

  // The watchdog lives outside Vercel, Supabase and Resend. Silence or /fail makes it alert you.
  if (d.healthcheckUrl) {
    await runJob(d.db, 'watchdog', async () => {
      const url = anyFailed ? `${d.healthcheckUrl!.replace(/\/$/, '')}/fail` : d.healthcheckUrl!;
      const res = await fetch(url, { method: 'POST', body: tick.detail.slice(0, 500), signal: AbortSignal.timeout(8000) });
      return { ok: res.ok, detail: res.ok ? (anyFailed ? 'Checked in and reported a failed check.' : 'Checked in.') : `Watchdog answered ${res.status}.` };
    });
  }
  // ran: the scheduler itself worked. ok: and every check is green.
  return { ok: !anyFailed, ran: tick.ok, detail: tick.detail };
}
