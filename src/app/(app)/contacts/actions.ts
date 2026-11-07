'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { withMessage, type MessageCode } from '@/lib/messages';
import { emailAdapter } from '@/lib/email';
import { queueAndSend } from '@/lib/email/send';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { STAGES } from '@/lib/config';
import { birthdayFromMonthDay, nextRepeatDue, parseRepeat, snoozeTo } from '@/lib/followups';
import { localDate } from '@/lib/time';

const UUID = /^[0-9a-f-]{36}$/i;
const t = (f: FormData, k: string, max = 500) => String(f.get(k) ?? '').trim().slice(0, max);
const id = (f: FormData, k = 'id') => { const v = t(f, k, 40); if (!UUID.test(v)) redirect('/today?msg=bad_input'); return v; };
const safeBack = (v: string, fallback: string) => (/^\/[a-z0-9/_-]*$/i.test(v) ? v : fallback);
const go = (path: string, code: MessageCode): never => { revalidatePath('/', 'layout'); redirect(withMessage(path, code)); };

export async function createContact(f: FormData) {
  const { db } = await requireOwner();
  const first = t(f, 'first_name', 100);
  const email = t(f, 'email', 320);
  const phone = t(f, 'phone', 40);
  if (!first || (!email && !phone)) go('/contacts/new', 'bad_input');
  const sourceType = ['personal','firm_provided','portal','unknown'].includes(t(f, 'source_type')) ? t(f, 'source_type') : 'unknown';
  const consent = t(f, 'consent') === 'opted_in' ? 'opted_in' : 'unknown';
  const { data: h, error } = await db.from('households').insert({
    display_name: [first, t(f, 'last_name', 100)].filter(Boolean).join(' '), stage: STAGES.includes(t(f, 'stage') as any) ? t(f, 'stage') : 'new lead',
    lead_source: t(f, 'lead_source', 200) || 'Added by hand', source_type: sourceType, first_contact_on: null,
  }).select('id').single();
  if (error || !h) go('/contacts/new', 'bad_input');
  const { data: p } = await db.from('people').insert({ household_id: h!.id, first_name: first, last_name: t(f, 'last_name', 100) || null }).select('id').single();
  const methods = [email && { kind: 'email', value: email }, phone && { kind: 'phone', value: phone }].filter(Boolean) as any[];
  if (methods.length) await db.from('contact_methods').insert(methods.map((m) => ({ ...m, household_id: h!.id, person_id: p?.id, is_primary: true })));
  await db.from('consent_records').insert({ household_id: h!.id, person_id: p?.id, status: consent, source: t(f, 'consent_source', 300) || 'Added by hand', source_type: sourceType, wording: consent === 'opted_in' ? t(f, 'consent_wording', 1000) || null : null });
  const due = t(f, 'followup_on', 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) await db.from('tasks').insert({ household_id: h!.id, title: t(f, 'followup_title', 300) || 'Follow up', due_on: due });
  go(`/contacts/${h!.id}`, 'contact_added');
}

export async function updateContact(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f);
  const stage = t(f, 'stage');
  const patch: Record<string, unknown> = { lead_source: t(f, 'lead_source', 200) || null, notes: t(f, 'notes', 10000) || null };
  if ((STAGES as readonly string[]).includes(stage) || stage === 'under contract') patch.stage = stage;
  if (['personal','firm_provided','portal','unknown'].includes(t(f, 'source_type'))) patch.source_type = t(f, 'source_type');
  if (t(f, 'display_name', 200)) patch.display_name = t(f, 'display_name', 200);
  const anniv = t(f, 'home_anniversary', 10);
  if (anniv === '' || /^\d{4}-\d{2}-\d{2}$/.test(anniv)) patch.home_anniversary = anniv || null;
  await db.from('households').update(patch).eq('id', hid);
  // Birthday: month and day only, so no age is ever stored.
  if (f.has('birthday_month')) {
    const bday = birthdayFromMonthDay(t(f, 'birthday_month', 2), t(f, 'birthday_day', 2));
    const { data: p } = await db.from('people').select('id').eq('household_id', hid).order('created_at').limit(1).maybeSingle();
    if (p) await db.from('people').update({ birthday: bday }).eq('id', p.id);
  }
  go(`/contacts/${hid}`, 'saved');
}

export async function addMethod(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f);
  const kind = t(f, 'kind') === 'phone' ? 'phone' : 'email';
  const value = t(f, 'value', 320);
  if (value.length < 3) go(`/contacts/${hid}`, 'bad_input');
  const { data: p } = await db.from('people').select('id').eq('household_id', hid).order('created_at').limit(1).maybeSingle();
  const { error } = await db.from('contact_methods').insert({ household_id: hid, person_id: p?.id ?? null, kind, value });
  go(`/contacts/${hid}`, error ? 'bad_input' : 'saved');
}

export async function addFollowUp(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f);
  const due = t(f, 'due_on', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) go(`/contacts/${hid}`, 'bad_input');
  const repeat = parseRepeat(t(f, 'repeat_days', 5));
  const { error } = await db.from('tasks').insert({ household_id: hid, title: t(f, 'title', 300) || 'Follow up', due_on: due, ...(repeat ? { repeat_days: repeat } : {}) });
  go(`/contacts/${hid}`, error ? 'bad_input' : 'followup_added');
}

export async function markDone(f: FormData) {
  const { db } = await requireOwner();
  const taskId = id(f);
  const { data: task } = await db.from('tasks').select('*').eq('id', taskId).maybeSingle();
  await db.from('tasks').update({ done_at: new Date().toISOString() }).eq('id', taskId);
  // A repeating follow-up comes back after its interval.
  if (task?.repeat_days) {
    const s = await getSettings(db);
    const today = localDate(new Date(), s.timezone);
    await db.from('tasks').insert({ household_id: task.household_id, title: task.title, due_on: nextRepeatDue(task.due_on, task.repeat_days, today), repeat_days: task.repeat_days });
    go(safeBack(t(f, 'back', 200), '/today'), 'followup_repeated');
  }
  go(safeBack(t(f, 'back', 200), '/today'), 'followup_done');
}

export async function editFollowUp(f: FormData) {
  const { db } = await requireOwner();
  const taskId = id(f);
  const back = safeBack(t(f, 'back', 200), '/today');
  const due = t(f, 'due_on', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) go(back, 'bad_input');
  const patch: Record<string, unknown> = { title: t(f, 'title', 300) || 'Follow up', due_on: due };
  const repeat = parseRepeat(t(f, 'repeat_days', 5));
  if (repeat || t(f, 'had_repeat') === 'yes') patch.repeat_days = repeat;
  const { error } = await db.from('tasks').update(patch).eq('id', taskId).is('done_at', null);
  go(back, error ? 'bad_input' : 'followup_saved');
}

export async function snoozeFollowUp(f: FormData) {
  const { db } = await requireOwner();
  const taskId = id(f);
  const back = safeBack(t(f, 'back', 200), '/today');
  const s = await getSettings(db);
  const due = snoozeTo(localDate(new Date(), s.timezone), t(f, 'snooze', 4));
  if (!due) go(back, 'bad_input');
  await db.from('tasks').update({ due_on: due }).eq('id', taskId).is('done_at', null);
  go(back, 'followup_snoozed');
}

export async function logInteraction(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f);
  const kind = ['call','text','email','meeting','showing','note'].includes(t(f, 'kind')) ? t(f, 'kind') : 'note';
  await db.from('interactions').insert({ household_id: hid, kind, summary: t(f, 'summary', 5000) || null });
  go(`/contacts/${hid}`, 'note_added');
}

export async function addConsent(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f);
  const status = ['unknown','opted_in','opted_out'].includes(t(f, 'status')) ? t(f, 'status') : 'unknown';
  const source = t(f, 'source', 300);
  if (!source) go(`/contacts/${hid}`, 'bad_input');
  const { data: p } = await db.from('people').select('id').eq('household_id', hid).order('created_at').limit(1).maybeSingle();
  await db.from('consent_records').insert({ household_id: hid, person_id: p?.id ?? null, status, source, wording: t(f, 'wording', 1000) || null });
  if (status === 'opted_out') {
    const { data: emails } = await db.from('contact_methods').select('value').eq('household_id', hid).eq('kind', 'email');
    for (const e of emails ?? []) await db.from('suppressions').upsert({ kind: 'email', value: e.value, reason: 'opt-out recorded by owner' }, { onConflict: 'kind,normalized', ignoreDuplicates: true });
  }
  go(`/contacts/${hid}`, 'saved');
}

export async function setArchived(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f);
  const archive = t(f, 'archive') === 'yes';
  await db.from('households').update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', hid);
  go(archive ? '/contacts' : `/contacts/${hid}`, archive ? 'contact_archived' : 'contact_restored');
}

export async function sendEmail(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f);
  const to = t(f, 'to', 320);
  const subject = t(f, 'subject', 300);
  const body = t(f, 'body', 20000);
  if (!to || !subject || !body) go(`/contacts/${hid}`, 'email_missing');
  const s = await getSettings(db);
  const { data: method } = await db.from('contact_methods').select('person_id').eq('household_id', hid).eq('kind', 'email').eq('normalized', to.toLowerCase()).maybeSingle();
  const kind = t(f, 'marketing') === 'yes' ? 'marketing' : 'one_to_one';
  const r = await queueAndSend(db, emailAdapter(), { householdId: hid, personId: method?.person_id ?? null, to, subject, body, kind }, { settings: s, appUrl: env.appUrl(), linkSecret: env.linkSecret() });
  if (r.ok) {
    await db.from('interactions').insert({ household_id: hid, kind: 'email', summary: `Emailed: ${subject}` });
    go(`/contacts/${hid}`, 'email_sent');
  }
  go(`/contacts/${hid}`, (r as any).code);
}

export async function saveDeal(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f, 'household_id');
  const num = (k: string) => { const v = t(f, k, 20).replace(/[$,]/g, ''); return v && !isNaN(Number(v)) ? Number(v) : null; };
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(t(f, k, 10)) ? t(f, k, 10) : null);
  const row = {
    household_id: hid, side: t(f, 'side') === 'seller' ? 'seller' : 'buyer',
    status: ['prospect','active','under contract','closed','dead'].includes(t(f, 'status')) ? t(f, 'status') : 'prospect',
    property_street: t(f, 'property_street', 200) || null, file_link: /^https:\/\//.test(t(f, 'file_link', 500)) ? t(f, 'file_link', 500) : null,
    sale_price: num('sale_price'), gci: num('gci'), net_to_me: num('net_to_me'), closing_date: date('closing_date'),
  };
  const dealId = t(f, 'deal_id', 40);
  if (UUID.test(dealId)) await db.from('deals').update(row).eq('id', dealId);
  else await db.from('deals').insert(row);
  go(`/contacts/${hid}`, 'deal_saved');
}

export async function addDealDate(f: FormData) {
  const { db } = await requireOwner();
  const hid = id(f, 'household_id');
  const due = t(f, 'due_on', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !t(f, 'label')) go(`/contacts/${hid}`, 'bad_input');
  const { error } = await db.from('deal_dates').insert({ deal_id: id(f, 'deal_id'), label: t(f, 'label', 120), due_on: due });
  go(`/contacts/${hid}`, error ? 'bad_input' : 'date_added');
}

export async function dealDateDone(f: FormData) {
  const { db } = await requireOwner();
  await db.from('deal_dates').update({ done_at: new Date().toISOString() }).eq('id', id(f));
  go(safeBack(t(f, 'back', 200), '/deals'), 'date_done');
}
