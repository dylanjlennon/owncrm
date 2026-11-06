import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/time';
import { SOURCE_CARDS } from '@/lib/history/sources';
import { Flash } from '@/components/Flash';
import { NewTokenForm } from './reveal';
import { disconnectSource, revokeToken, setSyncExpectation } from './actions';

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const [{ data: sources }, { data: tokens }, { data: batches }] = await Promise.all([
    db.from('history_sources').select('*'),
    db.from('history_tokens').select('id, label, expires_at, revoked_at, last_used_at, created_at').order('created_at', { ascending: false }).limit(20),
    db.from('history_batches').select('id, source, status, household_count, saved_count, created_at').order('created_at', { ascending: false }).limit(20),
  ]);
  const bySource = new Map((sources ?? []).map((x: any) => [x.source, x]));
  return (
    <>
      <h1>Connect your history</h1>
      <Flash code={sp.msg} />
      <p>Your own AI agent, on your own computer, reads your past email and texts and finds the people you have real estate relationships with. This app never sees your messages or holds your AI login. Only a checked summary folder comes here, and only the people you approve are saved.</p>
      <div className="notice warn">
        <strong>Before you connect anything:</strong> read your firm&apos;s policy and your independent contractor agreement. The other person in each message thread did not agree to AI processing. Family, friends, medical and legal threads are left out, and you review every person before anything is saved. This is not legal advice.
      </div>
      <p><Link href="/capabilities">What this can and can&apos;t do</Link>. Step by step: docs/TWO-PHASES.md and prompts/RESCUE.md in the download.</p>

      <h2>Sources</h2>
      <div className="cards">
        {SOURCE_CARDS.map((c) => {
          const st: any = bySource.get(c.key);
          return (
            <article key={c.key} className="card" data-testid={`source-${c.key}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}><h3>{c.title}</h3><span className={`tag ${c.verdict === 'Can' ? 'ok' : c.verdict === 'Later' ? 'warn' : 'bad'}`}>{c.verdict}</span></div>
              <p className="muted" style={{ margin: 0 }}>{c.route}</p>
              <dl>
                <dt>What it reads</dt><dd>{c.reads}</dd>
                <dt>What never leaves your computer</dt><dd>{c.staysLocal}</dd>
                <dt>What gets stored here</dt><dd>{c.stored}</dd>
                <dt>Status</dt><dd>{st?.status === 'connected' ? 'Connected' : st?.status === 'disconnected' ? 'Disconnected' : 'Not connected'}</dd>
                <dt>Last run</dt><dd>{st?.last_run_at ? `${formatDateTime(st.last_run_at, s.timezone)}${st.last_success_at === st.last_run_at ? '' : ' (failed)'}` : 'Never'}</dd>
                <dt>How to disconnect</dt><dd>{c.disconnect}</dd>
                {c.note && <><dt>Good to know</dt><dd>{c.note}</dd></>}
              </dl>
              {st?.status === 'connected' && <form action={disconnectSource}><input type="hidden" name="source" value={c.key} /><button className="quiet" type="submit">Mark disconnected</button></form>}
            </article>
          );
        })}
      </div>

      <h2>History token</h2>
      <p>The rescue tools use this token to send a checked folder here. It can only upload for review. It can&apos;t read your contacts. It expires, and you can revoke it any time.</p>
      <NewTokenForm />
      <ul className="list panel">
        {(tokens ?? []).map((t: any) => {
          const dead = t.revoked_at || Date.parse(t.expires_at) < Date.now();
          return (
            <li key={t.id}><span className="grow">{t.label}<br /><small>{t.revoked_at ? 'Revoked' : dead ? 'Expired' : `Expires ${formatDateTime(t.expires_at, s.timezone)}`}. Last used: {formatDateTime(t.last_used_at, s.timezone)}</small></span>
              {!dead && <form action={revokeToken}><input type="hidden" name="id" value={t.id} /><button className="quiet" type="submit">Revoke</button></form>}</li>
          );
        })}
        {!tokens?.length && <li className="muted">No tokens yet.</li>}
      </ul>

      <h2>Scheduled sync</h2>
      <p>You can schedule the rescue tools to run on your computer. It only works when that computer is on and signed in. If it stops checking in, Status turns red and you get an email.</p>
      <form action={setSyncExpectation} className="row panel">
        <label>Warn me if it has not run in<select name="hours" defaultValue={String(s.history_sync_expected_hours ?? '')}><option value="">Off (no schedule)</option><option value="24">1 day</option><option value="48">2 days</option><option value="168">7 days</option></select></label>
        <button className="quiet" type="submit">Save</button>
      </form>

      <h2>Batches waiting for you</h2>
      <ul className="list panel">
        {(batches ?? []).map((b: any) => (
          <li key={b.id}><span className="grow"><Link href={`/history/${b.id}`}>{b.source}: {b.household_count} people found</Link><br /><small>{formatDateTime(b.created_at, s.timezone)}</small></span>
            <span className={`tag ${b.status === 'pending_review' ? 'warn' : b.status === 'saved' ? 'ok' : ''}`}>{b.status === 'pending_review' ? 'Needs your review' : b.status === 'saved' ? `${b.saved_count} saved` : b.status}</span></li>
        ))}
        {!batches?.length && <li className="muted">Nothing uploaded yet.</li>}
      </ul>
    </>
  );
}
