import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/time';
import { Flash } from '@/components/Flash';
import { runCleanup, setFinding } from './actions';

const KIND: Record<string, string> = { duplicate: 'Possible duplicate', shared_contact: 'Shared email or phone', no_next_step: 'No next step', stale_deal: 'Stale deal', stage_drift: 'Stage drift', suppressed_contact: 'Opted-out contact', missing_income: 'Missing income' };

export default async function Cleanup({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const view = ['open', 'ignored', 'fixed'].includes(sp.view) ? sp.view : 'open';
  const { data: rows, count } = await db.from('hygiene_findings').select('id, kind, detail, severity, status, found_at, resolved_at, household_id, households(display_name)', { count: 'exact' }).eq('status', view).order('found_at', { ascending: false }).limit(200);
  return (
    <>
      <h1>Cleanup</h1>
      <Flash code={sp.msg} />
      <p>Runs every Monday morning. It only lists problems. It never changes a contact. Fixed findings stay in the history. Anything you ignore stays ignored.</p>
      <div className="row"><form action={runCleanup}><button type="submit">Run cleanup now</button></form>
        {['open', 'ignored', 'fixed'].map((v) => <Link key={v} href={`/cleanup?view=${v}`} aria-current={v === view ? 'page' : undefined}>{v === 'open' ? 'Open' : v === 'ignored' ? 'Ignored' : 'Fixed (history)'}</Link>)}</div>
      <p data-testid="findings-count">{count ?? 0} {view}{(count ?? 0) > 200 ? '. Showing the newest 200.' : '.'}</p>
      <ul className="list panel">
        {(rows ?? []).map((r: any) => (
          <li key={r.id}><span className="grow"><span className={`tag ${r.severity === 'high' ? 'bad' : r.severity === 'medium' ? 'warn' : ''}`}>{KIND[r.kind]}</span> <Link href={`/contacts/${r.household_id}`}>{r.households?.display_name}</Link><br /><small>{r.detail}. Found {formatDateTime(r.found_at, s.timezone)}{r.resolved_at ? `, closed ${formatDateTime(r.resolved_at, s.timezone)}` : ''}</small></span>
            {r.status !== 'fixed' && <form action={setFinding}><input type="hidden" name="id" value={r.id} /><button className="quiet" type="submit" name="status" value={r.status === 'open' ? 'ignored' : 'open'}>{r.status === 'open' ? 'Ignore' : 'Reopen'}</button></form>}</li>
        ))}
        {!rows?.length && <li className="muted">Nothing here.</li>}
      </ul>
    </>
  );
}
