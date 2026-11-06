import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/time';
import { PAGE_SIZE } from '@/lib/config';
import { pageWindow } from '@/lib/logic';
import { Pager } from '@/components/Pager';

const LABEL: Record<string, string> = { sent: 'Sent (accepted by provider)', delivered: 'Delivered', bounced: 'Bounced', complained: 'Marked as spam', failed: 'Not sent', queued: 'Queued', delayed: 'Delayed' };

export default async function Emails({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const { data: usage } = await db.from('v_email_usage').select('*').maybeSingle();
  const { count } = await db.from('outbound_emails').select('id', { count: 'exact', head: true });
  const w = pageWindow(Number(sp.page) || 1, PAGE_SIZE, count ?? 0);
  const { data: rows } = await db.from('outbound_emails').select('id, to_address, subject, kind, status, error, created_at, household_id').order('created_at', { ascending: false }).range(w.from, w.to);
  const { count: supp } = await db.from('suppressions').select('normalized', { count: 'exact', head: true });
  return (
    <>
      <h1>Email</h1>
      <div className="notice">One-to-one email only. Sent means your provider accepted it. Delivered and Bounced appear only when the provider reports back. Opt-outs are enforced by the database, so no screen or direct call can send to them. Replies go to your normal inbox, not here. This is not legal advice: you decide whether a message is allowed.</div>
      {usage && <p>Today: {usage.sent_today} of {usage.daily_email_cap} emails, with {usage.reserved_alert_budget} held back for alerts. This month: {usage.sent_this_month} of {usage.monthly_email_cap}. Opt-out list: {supp ?? 0} addresses.</p>}
      {s.sending_paused && <p className="flash bad">Sending is paused: {s.sending_paused_reason}</p>}
      <Pager total={count ?? 0} page={w.current} pageSize={PAGE_SIZE} base="/emails" />
      <div className="table-wrap"><table>
        <thead><tr><th>To</th><th>Subject</th><th>Type</th><th>Status</th><th>When</th></tr></thead>
        <tbody>
          {(rows ?? []).map((r: any) => (
            <tr key={r.id}><td>{r.household_id ? <Link href={`/contacts/${r.household_id}`}>{r.to_address}</Link> : r.to_address}</td><td>{r.subject}</td><td>{r.kind.replace('_', ' ')}</td>
              <td><span className={`tag ${['bounced','complained','failed'].includes(r.status) ? 'bad' : r.status === 'delivered' ? 'ok' : ''}`}>{LABEL[r.status]}</span>{r.error && <><br /><small>{r.error}</small></>}</td>
              <td>{formatDateTime(r.created_at, s.timezone)}</td></tr>
          ))}
          {!rows?.length && <tr><td colSpan={5} className="muted">No email yet. Send one from a contact&apos;s page.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
