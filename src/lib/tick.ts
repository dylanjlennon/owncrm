import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { getSettings, type Settings } from './settings';
import { leadAlertText, sendAlert } from './alerts';
import { dealReminderDue, noReplyDue } from './logic';
import { localDate, localHour, localWeekday, weekStart, formatDate } from './time';
import { lastSuccess, runJob } from './jobs';

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

async function dueOncePerDay(db: SupabaseClient, job: string, s: Settings, now: Date, hour: number) {
  if (localHour(now, s.timezone) < hour) return false;
  const last = await lastSuccess(db, job);
  return !last || localDate(new Date(last), s.timezone) !== localDate(now, s.timezone);
}
async function dueOncePerWeek(db: SupabaseClient, job: string, s: Settings, now: Date, hour: number) {
  if (localHour(now, s.timezone) < hour) return false;
  const last = await lastSuccess(db, job);
  return !last || weekStart(localDate(new Date(last), s.timezone)) !== weekStart(localDate(now, s.timezone));
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
      const r = await runJob(d.db, 'self_test', d.selfTest);
      outcomes.self_test = r.ok;
      if (!r.ok) await sendAlert(d.db, d.adapter, s, d.appUrl, { subject: 'Security self-test failed', text: `${r.detail}\n\nOpen Status: ${d.appUrl}/status`, alsoBackup: true });
    }
    if (s.weekly_fake_lead_enabled && localWeekday(d.now, s.timezone) === 'Mon' && await dueOncePerWeek(d.db, 'fake_lead', s, d.now, 7)) {
      const r = await runJob(d.db, 'fake_lead', d.fakeLead);
      outcomes.fake_lead = r.ok;
      if (!r.ok) await sendAlert(d.db, d.adapter, s, d.appUrl, { subject: 'Weekly test lead failed', text: `${r.detail}\n\nYour lead path may be broken. Open Status: ${d.appUrl}/status`, alsoBackup: true });
    }
    if (s.history_sync_expected_hours) {
      const { data: src } = await d.db.from('history_sources').select('last_success_at').order('last_success_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      const last = src?.last_success_at ? Date.parse(src.last_success_at) : 0;
      if (d.now.getTime() - last > s.history_sync_expected_hours * 3600000 && await dueOncePerDay(d.db, 'history_stale_alert', s, d.now, 9)) {
        await runJob(d.db, 'history_stale_alert', async () => {
          await sendAlert(d.db, d.adapter, s, d.appUrl, { subject: 'History sync has not run', text: 'The scheduled history sync on your computer has not checked in. It only runs when that computer is on and signed in.' });
          return { ok: true, detail: 'Stale history sync alert sent.' };
        });
      }
    }
    if (s.all_clear_enabled && await dueOncePerDay(d.db, 'all_clear', s, d.now, s.all_clear_local_hour)) {
      await runJob(d.db, 'all_clear', async () => {
        const failed = Object.entries(outcomes).filter(([, v]) => !v).map(([k]) => k);
        const r = await sendAlert(d.db, d.adapter, s, d.appUrl, {
          subject: failed.length ? 'Daily check: something needs attention' : 'Daily check: all clear',
          text: failed.length ? `These checks failed: ${failed.join(', ')}. Open Status: ${d.appUrl}/status` : `Everything ran. If this email ever does not arrive by ${s.all_clear_local_hour}:15, something is wrong. Open Status: ${d.appUrl}/status`,
        });
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
  return { ok: !anyFailed, detail: tick.detail };
}
