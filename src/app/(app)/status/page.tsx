import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { loadHealth } from '@/lib/health-load';
import { GOLIVE_ITEMS, goLiveReady } from '@/lib/health';
import { goLiveFacts } from '@/lib/golive';
import { formatDateTime } from '@/lib/time';
import { Flash } from '@/components/Flash';
import { completeGoLive, confirmTestAlert, domainCheckNow, recordRestoreDrill, resumeSending, selfTestNow, sendTestAlert, testLeadNow } from './actions';

const days = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null);

export default async function Status({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const [checks, facts, { data: lastLead }, { data: lastSent }] = await Promise.all([
    loadHealth(db, s), goLiveFacts(db),
    db.from('leads').select('received_at').eq('is_test', false).order('received_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('outbound_emails').select('sent_at').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const built = process.env.OWNCRM_BUILT_AT;
  const nextVersion = process.env.OWNCRM_NEXT_VERSION;
  const updateAge = days(built);
  const drillAge = days(s.last_restore_drill_at);
  return (
    <>
      <h1>Status</h1>
      <Flash code={sp.msg} />
      <p className="panel"><strong>You are the IT department.</strong> Nobody else watches this system. If a check below turns red, every screen shows a red bar until it is fixed. The outside watchdog emails you even if this whole app is down.</p>
      {s.sending_paused && <form action={resumeSending} className="flash bad row"><span className="grow">Sending is paused: {s.sending_paused_reason}</span><button type="submit">Turn sending back on</button></form>}
      <div className="table-wrap"><table>
        <thead><tr><th>Check</th><th>State</th><th>Last success</th><th>Detail</th></tr></thead>
        <tbody>
          <tr><td>Last lead received</td><td></td><td>{formatDateTime(lastLead?.received_at, s.timezone)}</td><td></td></tr>
          <tr><td>Last email sent</td><td></td><td>{formatDateTime(lastSent?.sent_at, s.timezone)}</td><td></td></tr>
          {checks.map((c) => (
            <tr key={c.key} data-testid={`check-${c.key}`}><td>{c.label}</td>
              <td><span className={`tag ${c.state === 'ok' ? 'ok' : c.state === 'fail' ? 'bad' : ''}`}>{c.state === 'ok' ? 'Working' : c.state === 'fail' ? 'Broken' : 'Not set up'}</span></td>
              <td>{formatDateTime(c.lastSuccessAt, s.timezone)}</td><td>{c.detail}</td></tr>
          ))}
          <tr data-testid="check-deploy"><td>Last deploy</td><td><span className={`tag ${updateAge !== null && updateAge > 45 ? 'warn' : 'ok'}`}>{updateAge === null ? 'Unknown' : `${updateAge} days ago`}</span></td><td>{formatDateTime(built, s.timezone)}</td><td>When this copy of the app was built{nextVersion ? `, with Next.js ${nextVersion}` : ''}. Any redeploy resets it, even a settings change, so it does not prove your packages are up to date. Do the monthly check-up in HOW-TO.md.</td></tr>
          <tr><td>Last restore drill</td><td><span className={`tag ${drillAge === null || drillAge > 90 ? 'warn' : 'ok'}`}>{drillAge === null ? 'Never' : `${drillAge} days ago`}</span></td><td>{formatDateTime(s.last_restore_drill_at, s.timezone)}</td><td>A backup only counts once you have restored it. Follow RESTORE.md every 3 months.</td></tr>
        </tbody>
      </table></div>
      <div className="row u-mt12">
        <form action={selfTestNow}><button className="quiet" type="submit">Run logged-out read test</button></form>
        <form action={testLeadNow}><button className="quiet" type="submit">Send a test lead</button></form>
        <form action={domainCheckNow}><button className="quiet" type="submit">Check sending domain</button></form>
        <form action={recordRestoreDrill}><button className="quiet" type="submit">I finished a restore drill</button></form>
      </div>

      <h2>Go-live checklist</h2>
      <p>Go-live can&apos;t be marked done until every item passes.</p>
      <ul className="list panel" data-testid="golive">
        {GOLIVE_ITEMS.map((i) => <li key={i.key}><span className={`tag ${facts[i.key] ? 'ok' : 'bad'}`}>{facts[i.key] ? 'Passed' : 'Not yet'}</span> <span className="grow">{i.label}</span></li>)}
      </ul>
      <div className="row">
        <form action={sendTestAlert}><button className="quiet" type="submit">Send a test alert</button></form>
        <form action={confirmTestAlert}><button className="quiet" type="submit">I got the test alert</button></form>
        <form action={completeGoLive}><button type="submit" disabled={!goLiveReady(facts)}>Finish go-live</button></form>
      </div>
      {s.golive_completed_at && <p className="tag ok">Go-live finished {formatDateTime(s.golive_completed_at, s.timezone)}</p>}
    </>
  );
}
