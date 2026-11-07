import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/time';
import { ZILLOW_NOTICE } from '@/lib/config';
import { Flash } from '@/components/Flash';
import { htmlToText } from '@/lib/html-text';
import { leadFromReview, resolveReview } from './actions';

export default async function Review({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const { data: items, count } = await db.from('inbound_emails').select('id, from_address, subject, text_body, html_body, received_at, review_reason, body_truncated', { count: 'exact' }).eq('status', 'needs_review').order('received_at', { ascending: false }).limit(25);
  return (
    <>
      <h1>Needs review</h1>
      <Flash code={sp.msg} />
      <p>Forwarded emails we could not read as a lead. Every one is saved, nothing is dropped. Read it, then make the lead by hand or mark it handled.</p>
      <div className="notice">{ZILLOW_NOTICE}</div>
      <p data-testid="review-count">{count ?? 0} waiting{(count ?? 0) > 25 ? '. Showing the newest 25.' : '.'}</p>
      {(items ?? []).map((e: any) => (
        <article key={e.id} className="panel">
          <h3>{e.subject || '(no subject)'}</h3>
          <p className="muted">From {e.from_address || 'unknown'}, {formatDateTime(e.received_at, s.timezone)}. Why it is here: {e.review_reason}</p>
          {/* Shown as plain text only. Email HTML is never rendered in the app. */}
          <pre className="u-pre">{(e.text_body ? String(e.text_body).slice(0, 5000) : htmlToText(e.html_body, 20_000)).slice(0, 5000)}</pre>
          {e.body_truncated && <p className="muted">This email was very long. The first part is saved.</p>}
          <form action={leadFromReview} className="row">
            <input type="hidden" name="id" value={e.id} />
            <input className="u-w120" name="first_name" placeholder="First name" aria-label="First name" maxLength={100} />
            <input className="u-w120" name="last_name" placeholder="Last name" aria-label="Last name" maxLength={100} />
            <input className="u-w160" name="email" placeholder="Email" aria-label="Email" maxLength={320} />
            <input className="u-w120" name="phone" placeholder="Phone" aria-label="Phone" maxLength={40} />
            <input className="u-w120" name="source" placeholder="Source" aria-label="Source" defaultValue="Realtor.com" maxLength={80} />
            <button type="submit">Make lead</button>
          </form>
          <form action={resolveReview} className="row u-mt8">
            <input type="hidden" name="id" value={e.id} />
            <button className="quiet" type="submit" name="status" value="resolved">Handled</button>
            <button className="quiet" type="submit" name="status" value="ignored">Not a lead</button>
          </form>
        </article>
      ))}
      {!items?.length && <p className="panel muted">Nothing needs review.</p>}
    </>
  );
}
