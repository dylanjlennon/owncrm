import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getCounts } from '@/lib/counts';
import { getSettings } from '@/lib/settings';
import { formatDate, formatDateTime } from '@/lib/time';
import { Flash } from '@/components/Flash';
import { markDone } from '../contacts/actions';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const [counts, { data: followups }, { data: dates }, { data: leads }, { data: next }] = await Promise.all([
    getCounts(db),
    db.from('v_today_followups').select('*').limit(100),
    db.from('v_today_deal_dates').select('*').limit(100),
    db.from('v_unreplied_leads').select('*').limit(50),
    db.from('v_next_best_actions').select('*').limit(10),
  ]);
  const today = new Date().toLocaleDateString('en-US', { timeZone: s.timezone, weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <>
      <Flash code={sp.msg} />
      <header className="today-head">
        <div className="date">{today}</div>
        <p data-testid="today-summary">
          {plural(counts.followups_due, 'follow-up', 'follow-ups')} due. {plural(counts.unreplied_leads, 'lead', 'leads')} waiting for a reply. {plural(counts.deal_dates_soon, 'deal date', 'deal dates')} in the next 7 days. <span data-testid="new-leads-count">{plural(counts.new_leads, 'contact', 'contacts')} in the new lead stage.</span>
        </p>
        <p className="muted">Dates follow your time zone: {s.timezone}.</p>
      </header>

      <div className="cols">
        <section>
          <h2>Leads waiting for a reply</h2>
          {leads?.length ? (
            <ul className="list panel">
              {leads.map((l: any) => (
                <li key={l.id} className="due">
                  <span className="grow"><Link href={`/contacts/${l.household_id}`}>{l.display_name}</Link><br /><small>{l.source}, {formatDateTime(l.received_at, s.timezone)}</small></span>
                  {l.primary_phone && <a className="button quiet" href={`tel:${String(l.primary_phone).replace(/[^\d+]/g, '')}`}>Call</a>}
                </li>
              ))}
            </ul>
          ) : <p className="panel muted">No one is waiting. New leads land here until you log a call, text or email.</p>}

          <h2>Follow-ups due</h2>
          {followups?.length ? (
            <ul className="list panel">
              {followups.map((f: any) => (
                <li key={f.id} className={f.overdue ? 'due' : ''}>
                  <span className="grow"><Link href={`/contacts/${f.household_id}`}>{f.display_name}</Link>: {f.title}<br />
                    <small className={f.overdue ? 'overdue' : ''}>{f.overdue ? 'Overdue since ' : 'Due '}{formatDate(f.due_on)}</small></span>
                  <form action={markDone} className="inline"><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value="/today" /><button className="quiet" type="submit">Done</button></form>
                </li>
              ))}
            </ul>
          ) : <p className="panel muted">Nothing due today. Add follow-ups from any contact.</p>}
        </section>

        <section>
          <h2>Deal dates, next 7 days</h2>
          {dates?.length ? (
            <ul className="list panel">
              {dates.map((d: any) => (
                <li key={d.id} className={d.days_out <= 2 ? 'due' : ''}>
                  <span className="grow"><strong>{d.label}</strong> {d.days_out < 0 ? <span className="overdue">overdue</span> : d.days_out === 0 ? 'today' : `in ${d.days_out} days`}<br />
                    <small><Link href={`/contacts/${d.household_id}`}>{d.property_street || d.display_name}</Link>, {formatDate(d.due_on)}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="panel muted">No key dates this week.</p>}
          <p className="muted">Not your transaction file. Keep that in your firm&apos;s system.</p>

          <h2>Who to call next</h2>
          <p className="muted">Ranked only by dates and stage.</p>
          {next?.length ? (
            <ul className="list panel">
              {next.map((n: any) => (
                <li key={n.household_id}>
                  <span className="grow"><Link href={`/contacts/${n.household_id}`}>{n.display_name}</Link> <span className="tag">{n.display_stage}</span><br />
                    <small>Last contact: {formatDate(n.last_contact_on)}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="panel muted">Everyone is up to date.</p>}
        </section>
      </div>
    </>
  );
}
