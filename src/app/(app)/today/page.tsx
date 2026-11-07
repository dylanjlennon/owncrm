import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getCounts } from '@/lib/counts';
import { getSettings } from '@/lib/settings';
import { formatDate, formatDateTime } from '@/lib/time';
import { Flash } from '@/components/Flash';
import { FollowUpItem } from '@/components/FollowUpItem';
import { upcomingOccasions } from '@/lib/followups';
import { localDate } from '@/lib/time';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const [counts, { data: followups }, { data: dates }, { data: leads }, { data: next }, { data: bdays }, { data: annivs }] = await Promise.all([
    getCounts(db),
    db.from('v_today_followups').select('*').limit(100),
    db.from('v_today_deal_dates').select('*').limit(100),
    db.from('v_unreplied_leads').select('*').limit(50),
    db.from('v_next_best_actions').select('*').limit(10),
    db.from('people').select('household_id, first_name, last_name, birthday, households!inner(display_name, archived_at, is_test, stage)').not('birthday', 'is', null).is('households.archived_at', null).eq('households.is_test', false).limit(5000),
    db.from('households').select('id, display_name, home_anniversary').not('home_anniversary', 'is', null).is('archived_at', null).eq('is_test', false).neq('stage', 'do not contact').limit(5000),
  ]);
  const occasions = upcomingOccasions([
    ...(bdays ?? []).filter((p: any) => p.households?.stage !== 'do not contact').map((p: any) => ({ kind: 'birthday' as const, household_id: p.household_id, name: [p.first_name, p.last_name].filter(Boolean).join(' '), date: p.birthday })),
    ...(annivs ?? []).map((h: any) => ({ kind: 'home_anniversary' as const, household_id: h.id, name: h.display_name, date: h.home_anniversary })),
  ], localDate(new Date(), s.timezone), 30);
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
              {followups.map((f: any) => <FollowUpItem key={f.id} task={f} back="/today" who={{ id: f.household_id, name: f.display_name }} />)}
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

          <h2>Birthdays and home anniversaries, next 30 days</h2>
          {occasions.length ? (
            <ul className="list panel" data-testid="occasions">
              {occasions.map((o) => (
                <li key={`${o.kind}-${o.household_id}-${o.name}`}>
                  <span className="grow"><Link href={`/contacts/${o.household_id}`}>{o.name}</Link>: {o.kind === 'birthday' ? 'birthday' : `home anniversary${o.years ? `, ${o.years} ${o.years === 1 ? 'year' : 'years'}` : ''}`}<br />
                    <small>{o.days_until === 0 ? 'Today' : o.days_until === 1 ? 'Tomorrow' : `In ${o.days_until} days`}, {new Date(`${o.on}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="panel muted">None in the next 30 days. Add birthdays and home anniversaries under Details on any contact.</p>}

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
