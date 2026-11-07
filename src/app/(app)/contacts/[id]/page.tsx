import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { CONSENT_LABELS, SOURCE_TYPES, STAGES, NOT_TRANSACTION_FILE } from '@/lib/config';
import { formatDate, formatDateTime } from '@/lib/time';
import { getSettings } from '@/lib/settings';
import { Flash } from '@/components/Flash';
import { addConsent, addDealDate, addFollowUp, addMethod, dealDateDone, logInteraction, saveDeal, sendEmail, setArchived, updateContact } from '../actions';
import { FollowUpItem } from '@/components/FollowUpItem';
import { REPEAT_CHOICES } from '@/lib/followups';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const STATUS_TAG: Record<string, string> = { sent: 'Sent (accepted by provider)', delivered: 'Delivered', bounced: 'Bounced', complained: 'Marked as spam', failed: 'Not sent', queued: 'Queued', delayed: 'Delayed' };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const { data: h } = await db.from('v_households').select('*').eq('id', id).maybeSingle();
  if (!h) notFound();
  const [{ data: people }, { data: methods }, { data: tasks }, { data: timeline }, { data: deals }, { data: emails }, { data: consents }] = await Promise.all([
    db.from('people').select('*').eq('household_id', id).order('created_at'),
    db.from('contact_methods').select('*').eq('household_id', id).order('created_at'),
    db.from('tasks').select('*').eq('household_id', id).is('done_at', null).order('due_on'),
    db.from('interactions').select('*').eq('household_id', id).order('occurred_at', { ascending: false }).limit(100),
    db.from('deals').select('*, deal_dates(*)').eq('household_id', id).order('created_at', { ascending: false }),
    db.from('outbound_emails').select('id, to_address, subject, status, kind, created_at, error').eq('household_id', id).order('created_at', { ascending: false }).limit(20),
    db.from('consent_records').select('*').eq('household_id', id).order('recorded_at', { ascending: false }).limit(20),
  ]);
  const emailMethods = (methods ?? []).filter((m: any) => m.kind === 'email');
  const bday: string | null = (people ?? [])[0]?.birthday ?? null;
  const { data: supp } = emailMethods.length
    ? await db.from('suppressions').select('normalized, reason').eq('kind', 'email').in('normalized', emailMethods.map((m: any) => m.normalized))
    : { data: [] as any[] };
  const suppressed = new Map((supp ?? []).map((x: any) => [x.normalized, x.reason]));
  return (
    <>
      <Flash code={sp.msg} />
      <h1>{h.display_name}</h1>
      <div className="row">
        <span className="tag">{h.display_stage}</span>
        {h.stage_drift && <span className="tag warn">Saved stage is &quot;{h.stored_stage}&quot;. Deals decide what shows.</span>}
        {h.archived_at && <span className="tag bad">Archived</span>}
      </div>

      <section className="panel">
        <dl className="kv">
          <dt>Consent</dt><dd data-testid="consent-status"><span className={`tag ${h.consent_status === 'opted_in' ? 'ok' : h.consent_status === 'opted_out' ? 'bad' : ''}`}>{CONSENT_LABELS[h.consent_status]}</span></dd>
          <dt>Consent source</dt><dd>{h.consent_source || 'None recorded'}{h.consent_at ? `, ${formatDateTime(h.consent_at, s.timezone)}` : ''}</dd>
          <dt>Source type</dt><dd data-testid="source-type">{SOURCE_TYPES[h.source_type]}</dd>
          <dt>Came from</dt><dd>{h.lead_source || 'Not recorded'}</dd>
          <dt>First contact</dt><dd>{formatDate(h.first_contact_on)}</dd>
          <dt>Last contact</dt><dd>{formatDate(h.last_contact_on)}</dd>
          <dt>People</dt><dd>{(people ?? []).map((p: any) => `${p.first_name} ${p.last_name ?? ''}${p.do_not_contact ? ' (do not contact)' : ''}`).join(', ')}</dd>
          {(methods ?? []).map((m: any) => (
            <span className="u-contents" key={m.id}>
              <dt>{m.kind === 'email' ? 'Email' : 'Phone'}</dt>
              <dd>
                {m.kind === 'phone' ? <a href={`tel:${m.value.replace(/[^\d+]/g, '')}`}>{m.value}</a> : <a href={`mailto:${m.value}`}>{m.value}</a>}
                {!m.is_valid && <span className="tag bad"> {m.invalid_reason || 'Not valid'}</span>}
                {m.kind === 'email' && suppressed.has(m.normalized) && <span className="tag bad"> Opted out: {suppressed.get(m.normalized)}</span>}
              </dd>
            </span>
          ))}
        </dl>
        <form action={addMethod} className="row u-mt10">
          <input type="hidden" name="id" value={id} />
          <select className="u-wauto" name="kind" aria-label="Kind"><option value="email">Email</option><option value="phone">Phone</option></select>
          <input className="u-w200" name="value" aria-label="Email or phone" maxLength={320} />
          <button className="quiet" type="submit">Add</button>
        </form>
      </section>

      <div className="cols">
        <section>
          <h2>Follow-ups</h2>
          <ul className="list panel">
            {(tasks ?? []).map((t: any) => <FollowUpItem key={t.id} task={t} back={`/contacts/${id}`} />)}
            {!tasks?.length && <li className="muted">No next step. Add one so this person shows up on Today.</li>}
          </ul>
          <form action={addFollowUp} className="row panel">
            <input type="hidden" name="id" value={id} />
            <label className="u-f180">What<input name="title" maxLength={300} defaultValue="Follow up" /></label>
            <label>When<input name="due_on" type="date" required /></label>
            <label>Repeat<select name="repeat_days" defaultValue=""><option value="">Does not repeat</option>{REPEAT_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}</select></label>
            <button type="submit">Add follow-up</button>
          </form>

          <h2>Log what happened</h2>
          <form action={logInteraction} className="stack panel">
            <input type="hidden" name="id" value={id} />
            <label>Type<select name="kind"><option value="call">Call</option><option value="text">Text</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="showing">Showing</option><option value="note">Note</option></select></label>
            <label>Summary<textarea name="summary" maxLength={5000} /></label>
            <button type="submit">Add to timeline</button>
            <small>Logging a call, text, email, meeting or showing also stops the no-reply alerts for this lead.</small>
          </form>

          <h2>Timeline</h2>
          <ul className="timeline">
            {(timeline ?? []).map((i: any) => (
              <li key={i.id}><strong>{i.kind}</strong> <small>{formatDateTime(i.occurred_at, s.timezone)}</small><br />{i.summary}</li>
            ))}
            {!timeline?.length && <li className="muted">Nothing yet.</li>}
          </ul>
        </section>

        <section>
          <h2>Email</h2>
          <div className="notice">Sent means your email provider accepted it. Delivered or Bounced shows only after the provider reports back. Opt-outs are blocked by the database, not just this screen.</div>
          <form action={sendEmail} className="stack panel">
            <input type="hidden" name="id" value={id} />
            <label>To<select name="to">{emailMethods.map((m: any) => <option key={m.id} value={m.value}>{m.value}</option>)}</select></label>
            <label>Subject<input name="subject" maxLength={300} required /></label>
            <label>Message<textarea name="body" maxLength={20000} required /></label>
            <label className="check"><input type="checkbox" name="marketing" value="yes" /> This is marketing (adds an unsubscribe link and needs recorded consent)</label>
            <button type="submit" disabled={!emailMethods.length}>Send</button>
            {!emailMethods.length && <small>Add an email address first.</small>}
          </form>
          <ul className="list panel">
            {(emails ?? []).map((e: any) => (
              <li key={e.id}><span className="grow">{e.subject}<br /><small>{e.to_address}, {formatDateTime(e.created_at, s.timezone)}{e.error ? `. ${e.error}` : ''}</small></span>
                <span className={`tag ${['bounced','complained','failed'].includes(e.status) ? 'bad' : e.status === 'delivered' ? 'ok' : ''}`} data-testid="email-status">{STATUS_TAG[e.status]}</span></li>
            ))}
            {!emails?.length && <li className="muted">No email sent from here yet.</li>}
          </ul>

          <h2>Deals</h2>
          <div className="notice warn">{NOT_TRANSACTION_FILE} Dates are what you type. Check them against the contract.</div>
          {(deals ?? []).map((d: any) => (
            <div key={d.id} className="panel">
              <form action={saveDeal} className="stack">
                <input type="hidden" name="household_id" value={id} /><input type="hidden" name="deal_id" value={d.id} />
                <div className="row">
                  <label>Side<select name="side" defaultValue={d.side}><option>buyer</option><option>seller</option></select></label>
                  <label>Status<select name="status" defaultValue={d.status}>{['prospect','active','under contract','closed','dead'].map((x) => <option key={x}>{x}</option>)}</select></label>
                </div>
                <label>Property<input name="property_street" defaultValue={d.property_street ?? ''} maxLength={200} /></label>
                <label>Link to the firm&apos;s file (https)<input name="file_link" defaultValue={d.file_link ?? ''} maxLength={500} /></label>
                <div className="row">
                  <label>Closing<input type="date" name="closing_date" defaultValue={d.closing_date ?? ''} /></label>
                  <label>Net to you<input name="net_to_me" inputMode="decimal" defaultValue={d.net_to_me ?? ''} /></label>
                </div>
                <input type="hidden" name="sale_price" value={d.sale_price ?? ''} /><input type="hidden" name="gci" value={d.gci ?? ''} />
                <button className="quiet" type="submit">Save deal</button>
              </form>
              <h3 className="u-mt12">Key dates</h3>
              <ul className="list">
                {(d.deal_dates ?? []).sort((a: any, b: any) => a.due_on.localeCompare(b.due_on)).map((dd: any) => (
                  <li key={dd.id}><span className="grow">{dd.label}: {formatDate(dd.due_on)} {dd.done_at && <span className="tag ok">Done</span>}</span>
                    {!dd.done_at && <form action={dealDateDone} className="inline"><input type="hidden" name="id" value={dd.id} /><input type="hidden" name="back" value={`/contacts/${id}`} /><button className="quiet" type="submit">Done</button></form>}</li>
                ))}
              </ul>
              <form action={addDealDate} className="row">
                <input type="hidden" name="household_id" value={id} /><input type="hidden" name="deal_id" value={d.id} />
                <input className="u-w160" name="label" aria-label="Date name" placeholder="Due diligence ends" maxLength={120} />
                <input className="u-wauto" type="date" name="due_on" aria-label="Date" />
                <button className="quiet" type="submit">Add date</button>
              </form>
            </div>
          ))}
          <details className="panel"><summary>Add a deal</summary>
            <form action={saveDeal} className="stack">
              <input type="hidden" name="household_id" value={id} />
              <div className="row">
                <label>Side<select name="side"><option>buyer</option><option>seller</option></select></label>
                <label>Status<select name="status" defaultValue="active">{['prospect','active','under contract','closed','dead'].map((x) => <option key={x}>{x}</option>)}</select></label>
              </div>
              <label>Property<input name="property_street" maxLength={200} /></label>
              <label>Closing<input type="date" name="closing_date" /></label>
              <label>Net to you<input name="net_to_me" inputMode="decimal" /></label>
              <button type="submit">Add deal</button>
            </form>
          </details>

          <h2>Consent history</h2>
          <ul className="list panel">
            {(consents ?? []).map((c: any) => (
              <li key={c.id}><span className="grow">{CONSENT_LABELS[c.status]}, {c.source}<br /><small>{formatDateTime(c.recorded_at, s.timezone)}{c.wording ? `. Wording: "${c.wording}"` : ''}</small></span></li>
            ))}
          </ul>
          <form action={addConsent} className="stack panel">
            <input type="hidden" name="id" value={id} />
            <label>Record consent<select name="status"><option value="opted_in">Agreed to marketing email</option><option value="opted_out">Asked to stop</option><option value="unknown">Unknown</option></select></label>
            <label>How you know (required)<input name="source" maxLength={300} required /></label>
            <label>Exact wording, if any<input name="wording" maxLength={1000} /></label>
            <button className="quiet" type="submit">Add to consent history</button>
            <small>Asked to stop adds their email to the opt-out list for good. It can&apos;t be undone from the app.</small>
          </form>

          <h2>Details</h2>
          <form action={updateContact} className="stack panel">
            <input type="hidden" name="id" value={id} />
            <label>Name<input name="display_name" defaultValue={h.display_name} maxLength={200} /></label>
            <label>Saved stage<select name="stage" defaultValue={h.stored_stage}>{[...STAGES, 'under contract'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Came from<input name="lead_source" defaultValue={h.lead_source ?? ''} maxLength={200} /></label>
            <label>Source type<select name="source_type" defaultValue={h.source_type}><option value="personal">Personal</option><option value="firm_provided">Firm-provided</option><option value="portal">Portal</option><option value="unknown">Not stated</option></select></label>
            <div className="row">
              <label>Birthday month<select name="birthday_month" defaultValue={bday ? Number(bday.slice(5, 7)) : ''}><option value="">Not set</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
              <label>Day<input name="birthday_day" type="number" min={1} max={31} defaultValue={bday ? Number(bday.slice(8, 10)) : ''} /></label>
            </div>
            <small>Month and day only. The year is never stored, so the CRM never knows anyone&apos;s age.</small>
            <label>Home anniversary (the day they closed on their home)<input name="home_anniversary" type="date" defaultValue={h.home_anniversary ?? ''} /></label>
            <label>Notes (relationship memory only)<textarea name="notes" defaultValue={h.notes ?? ''} maxLength={10000} /></label>
            <button className="quiet" type="submit">Save details</button>
          </form>
          <form action={setArchived} className="row">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="archive" value={h.archived_at ? 'no' : 'yes'} />
            <button className="quiet" type="submit">{h.archived_at ? 'Restore contact' : 'Archive contact'}</button>
          </form>
          <p><Link href="/contacts">Back to contacts</Link></p>
        </section>
      </div>
    </>
  );
}
