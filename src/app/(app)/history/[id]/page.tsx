import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { Flash } from '@/components/Flash';
import { saveDecisions } from '../actions';
import { undoImport } from '../../import/actions';

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireOwner();
  const { data: b } = await db.from('history_batches').select('*').eq('id', id).maybeSingle();
  if (!b) notFound();
  const p = b.payload || {};
  const methods = (hid: string) => (p.contact_methods ?? []).filter((m: any) => m.household_id === hid).map((m: any) => m.value).join(', ');
  const evidence = (hid: string) => (p.source_evidence ?? []).filter((e: any) => e.household_id === hid);
  const approved = new Set<string>(b.approved ?? []);
  return (
    <>
      <h1>Review: {b.source}</h1>
      <Flash code={sp.msg} />
      <p>Approve the people you have a real estate relationship with. Nothing is saved until you press Save. Saved people get unknown consent and no marketing email. Nobody is contacted.</p>
      {b.status === 'saved' && b.import_id && (
        <form action={undoImport} className="row panel"><input type="hidden" name="id" value={b.import_id} /><span className="grow">{b.saved_count} people saved from this batch.</span><button className="danger" type="submit">Undo this batch</button></form>
      )}
      <form action={saveDecisions}>
        <input type="hidden" name="id" value={id} />
        <div className="table-wrap"><table>
          <thead><tr><th>Approve</th><th>Person</th><th>Suggested</th><th>Why, and where it came from</th></tr></thead>
          <tbody>
            {(p.households ?? []).map((h: any) => (
              <tr key={h.household_id}>
                <td><input type="checkbox" name="approve" value={h.household_id} aria-label={`Approve ${h.display_name}`} defaultChecked={approved.has(h.household_id)} disabled={b.status !== 'pending_review'} /></td>
                <td><strong>{h.display_name}</strong><br /><small>{methods(h.household_id)}</small><br /><small>{h.first_contact_on || '?'} to {h.last_contact_on || '?'}</small></td>
                <td><span className="tag">{h.stage}</span><br /><small>{h.suggested_next_step || 'No next step suggested'}</small><br /><small className="muted">{h.summary}</small></td>
                <td><small>{h.why || 'No reason given'}</small><ul style={{ margin: 0, paddingLeft: 18 }}>{evidence(h.household_id).map((e: any, i: number) => <li key={i}><small>{e.source}, {e.evidence_type}{e.message_count ? `, ${e.message_count} ${e.message_count === '1' ? 'item' : 'items'}` : ''}</small></li>)}</ul></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {b.status === 'pending_review' && (
          <div className="row panel">
            <button type="submit" name="do" value="save">Save the people I checked</button>
            <label className="check"><input type="checkbox" name="approve_all" value="yes" /> Approve everyone in this batch</label>
            <button className="quiet" type="submit" name="do" value="reject">Reject the whole batch</button>
          </div>
        )}
      </form>
      <p><Link href="/history">Back to Connect your history</Link></p>
    </>
  );
}
