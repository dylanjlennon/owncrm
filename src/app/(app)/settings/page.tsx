import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { Flash } from '@/components/Flash';
import { saveAiKey, saveSettings, signOutEverywhere } from './actions';

const ZONES = ['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const { data: ai } = await db.from('app_secrets').select('name, enabled, updated_at').eq('name', 'ai_api_key').maybeSingle();
  const formKey = env.leadFormKey();
  const formUrl = formKey ? `${env.appUrl()}/lead/${formKey}` : null;
  return (
    <>
      <h1>Settings</h1>
      <Flash code={sp.msg} />
      <form action={saveSettings} className="stack panel">
        <h2 style={{ marginTop: 0 }}>You</h2>
        <label>Your name or business name (shown as the sender)<input name="display_name" defaultValue={s.display_name ?? ''} maxLength={120} /></label>
        <label>Time zone (used for every due date)<select name="timezone" defaultValue={s.timezone}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label>Postal address (required by law on marketing email)<input name="postal_address" defaultValue={s.postal_address ?? ''} maxLength={300} /></label>
        <h2>Alerts</h2>
        <label>Your alert email<input name="owner_email" type="email" defaultValue={s.owner_email ?? ''} maxLength={320} /></label>
        <label>Backup contact on another domain (gets escalations, no login)<input name="backup_email" type="email" defaultValue={s.backup_email ?? ''} maxLength={320} /></label>
        <div className="row">
          <label>First no-reply alert after (minutes)<input name="no_reply_first_minutes" type="number" min={1} max={1440} defaultValue={s.no_reply_first_minutes} /></label>
          <label>Second alert, also to backup (minutes)<input name="no_reply_second_minutes" type="number" min={2} max={2880} defaultValue={s.no_reply_second_minutes} /></label>
        </div>
        <label>Deal date reminders at (local hour, 0 to 23)<input name="reminder_local_hour" type="number" min={0} max={23} defaultValue={s.reminder_local_hour} /></label>
        <label className="check"><input type="checkbox" name="all_clear_enabled" value="yes" defaultChecked={s.all_clear_enabled} /> Send me a daily all-clear email. No email by that time means something is wrong.</label>
        <label>All-clear at (local hour)<input name="all_clear_local_hour" type="number" min={0} max={23} defaultValue={s.all_clear_local_hour} /></label>
        <label className="check"><input type="checkbox" name="weekly_fake_lead_enabled" value="yes" defaultChecked={s.weekly_fake_lead_enabled} /> Send a fake lead through the whole system every Monday, then remove it</label>
        <h2>Sending</h2>
        <label>Send from (an address on a domain you control)<input name="sender_email" type="email" defaultValue={s.sender_email ?? ''} maxLength={320} /></label>
        <label>Replies go to (your real inbox)<input name="reply_to" type="email" defaultValue={s.reply_to ?? ''} maxLength={320} /></label>
        <div className="row">
          <label>Daily email limit<input name="daily_email_cap" type="number" defaultValue={s.daily_email_cap} /></label>
          <label>Monthly email limit<input name="monthly_email_cap" type="number" defaultValue={s.monthly_email_cap} /></label>
          <label>Held back for alerts<input name="reserved_alert_budget" type="number" defaultValue={s.reserved_alert_budget} /></label>
        </div>
        <h2>Web form</h2>
        <label>Exact consent wording shown next to the checkbox (stored with each lead)<textarea name="form_consent_wording" defaultValue={s.form_consent_wording} maxLength={1000} /></label>
        {formUrl ? <p>Your form: <a href={formUrl}>{formUrl}</a>. Link to it from your website. See HOW-TO.md for the embed code.</p> : <p className="muted">Add LEAD_FORM_KEY in your hosting settings to turn on the form.</p>}
        <button type="submit">Save settings</button>
      </form>

      <form action={saveAiKey} className="stack panel">
        <h2 style={{ marginTop: 0 }}>Optional AI key (off by default)</h2>
        <p>Only for future server-side AI features. Leave this empty unless you need it. It is encrypted before it is saved and is never shown again. Never put a Claude.ai or other AI subscription login here: those are not allowed in apps like this. Rescuing your history uses your own AI agent on your own computer, not this key.</p>
        <p>Status: {ai ? `Saved, ${ai.enabled ? 'on' : 'off'}` : 'No key saved'}</p>
        <label>API key<input name="ai_api_key" type="password" autoComplete="off" maxLength={300} /></label>
        <label className="check"><input type="checkbox" name="enabled" value="yes" defaultChecked={!!ai?.enabled} /> Turn it on</label>
        <div className="row"><button className="quiet" type="submit">Save key</button>{ai && <button className="quiet" type="submit" name="remove" value="yes">Remove key</button>}</div>
      </form>

      <form action={signOutEverywhere} className="panel row">
        <span className="grow">Lost a device? This ends every session, including this one.</span>
        <button className="danger" type="submit">Sign out everywhere</button>
      </form>
    </>
  );
}
