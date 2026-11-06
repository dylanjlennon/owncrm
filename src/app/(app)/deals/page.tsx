import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { NOT_TRANSACTION_FILE, PAGE_SIZE } from '@/lib/config';
import { pageWindow } from '@/lib/logic';
import { formatDate } from '@/lib/time';
import { Pager } from '@/components/Pager';
import { Flash } from '@/components/Flash';

export default async function Deals({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const status = ['prospect','active','under contract','closed','dead'].includes(sp.status) ? sp.status : '';
  const q = () => { let x = db.from('deals').select('id, side, status, property_street, closing_date, net_to_me, household_id, households(display_name), deal_dates(label, due_on, done_at)', { count: 'exact' }); if (status) x = x.eq('status', status); return x; };
  const { count } = await q().range(0, 0);
  const w = pageWindow(Number(sp.page) || 1, PAGE_SIZE, count ?? 0);
  const { data: deals } = await q().order('closing_date', { ascending: true, nullsFirst: false }).range(w.from, w.to);
  return (
    <>
      <h1>Deals</h1>
      <Flash code={sp.msg} />
      <div className="notice warn">{NOT_TRANSACTION_FILE} No documents, signatures or broker review live here. Dates are what you typed.</div>
      <form className="row panel"><label>Status<select name="status" defaultValue={status}><option value="">Any</option>{['prospect','active','under contract','closed','dead'].map((s) => <option key={s}>{s}</option>)}</select></label><button className="quiet" type="submit">Show</button></form>
      <Pager total={count ?? 0} page={w.current} pageSize={PAGE_SIZE} base="/deals" params={status ? { status } : {}} />
      <div className="table-wrap"><table>
        <thead><tr><th>Property</th><th>Client</th><th>Status</th><th>Next key date</th><th>Net to you</th></tr></thead>
        <tbody>
          {(deals ?? []).map((d: any) => {
            const next = (d.deal_dates ?? []).filter((x: any) => !x.done_at).sort((a: any, b: any) => a.due_on.localeCompare(b.due_on))[0];
            return (
              <tr key={d.id}><td>{d.property_street || 'No address'}<br /><small>{d.side}</small></td>
                <td><Link href={`/contacts/${d.household_id}`}>{d.households?.display_name}</Link></td>
                <td><span className="tag">{d.status}</span></td>
                <td>{next ? `${next.label}, ${formatDate(next.due_on)}` : <span className="muted">None</span>}</td>
                <td>{d.net_to_me != null ? `$${Number(d.net_to_me).toLocaleString('en-US')}` : <span className="muted">Not entered</span>}</td></tr>
            );
          })}
          {!deals?.length && <tr><td colSpan={5} className="muted">No deals yet. Add one from a contact&apos;s page.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
