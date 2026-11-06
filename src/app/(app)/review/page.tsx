import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/time';
import { ZILLOW_NOTICE } from '@/lib/config';
import { Flash } from '@/components/Flash';
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
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', background: '#f0f3f1', padding: 10 }}>{(e.text_body || (e.html_body || '').replace(/<[^>]+>/g, ' ')).slice(0, 5000)}</pre>
          {e.body_truncated && <p className="muted">This email was very long. The first part is saved.</p>}
          <form action={leadFromReview} className="row">
            <input type="hidden" name="id" value={e.id} />
            <input name="first_name" placeholder="First name" aria-label="First name" maxLength={100} style={{ width: 'auto', flex: '1 1 120px' }} />
            <input name="last_name" placeholder="Last name" aria-label="Last name" maxLength={100} style={{ width: 'auto', flex: '1 1 120px' }} />
            <input name="email" placeholder="Email" aria-label="Email" maxLength={320} style={{ width: 'auto', flex: '1 1 160px' }} />
            <input name="phone" placeholder="Phone" aria-label="Phone" maxLength={40} style={{ width: 'auto', flex: '1 1 120px' }} />
            <input name="source" placeholder="Source" aria-label="Source" defaultValue="Realtor.com" maxLength={80} style={{ width: 'auto', flex: '1 1 120px' }} />
            <button type="submit">Make lead</button>
          </form>
          <form action={resolveReview} className="row" style={{ marginTop: 8 }}>
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
