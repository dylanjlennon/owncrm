import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { PAGE_SIZE, CONSENT_LABELS, SOURCE_TYPES } from '@/lib/config';
import { pageWindow } from '@/lib/logic';
import { formatDate } from '@/lib/time';
import { Pager } from '@/components/Pager';
import { Flash } from '@/components/Flash';

export default async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const q = String(sp.q || '').trim().slice(0, 100);
  const stage = String(sp.stage || '');
  const archived = sp.archived === '1';
  const build = () => {
    let query = db.from('v_households').select('id, display_name, display_stage, primary_email, primary_phone, next_follow_up_on, last_contact_on, consent_status, source_type, lead_source, stage_drift', { count: 'exact' }).eq('is_test', false);
    query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
    if (stage) query = query.eq('display_stage', stage);
    if (q) {
      const escaped = q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
      const digits = q.replace(/\D/g, '');
      query = digits.length >= 4 && digits.length >= q.replace(/[\s()+.-]/g, '').length
        ? query.ilike('search_text', `%${digits}%`) : query.ilike('search_text', `%${escaped}%`);
    }
    return query;
  };
  const { count } = await build().range(0, 0);
  const total = count ?? 0;
  const w = pageWindow(Number(sp.page) || 1, PAGE_SIZE, total);
  const { data: rows } = await build().order('display_name').range(w.from, w.to);
  const params: Record<string, string> = {};
  if (q) params.q = q; if (stage) params.stage = stage; if (archived) params.archived = '1';
  return (
    <>
      <Flash code={sp.msg} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Contacts</h1>
        <Link className="button" href="/contacts/new">Add contact</Link>
      </div>
      <form className="row panel" role="search">
        <label style={{ flex: '1 1 260px' }}>Search by name, email or phone<input name="q" defaultValue={q} maxLength={100} /></label>
        <label>Stage<select name="stage" defaultValue={stage}><option value="">Any</option>{['new lead','active buyer','active seller','under contract','past client','sphere','nurture','cold lead','do not contact'].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="check"><input type="checkbox" name="archived" value="1" defaultChecked={archived} /> Archived</label>
        <button type="submit">Search</button>
      </form>
      <Pager total={total} page={w.current} pageSize={PAGE_SIZE} base="/contacts" params={params} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Stage</th><th>Next follow-up</th><th>Consent</th><th>Source</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r: any) => (
              <tr key={r.id}>
                <td><Link href={`/contacts/${r.id}`}>{r.display_name}</Link><br /><small>{r.primary_phone || r.primary_email || 'No contact method'}</small></td>
                <td><span className="tag">{r.display_stage}</span>{r.stage_drift && <><br /><small className="overdue">Saved stage differs</small></>}</td>
                <td>{r.next_follow_up_on ? formatDate(r.next_follow_up_on) : <span className="muted">None</span>}</td>
                <td><span className={`tag ${r.consent_status === 'opted_in' ? 'ok' : r.consent_status === 'opted_out' ? 'bad' : ''}`}>{CONSENT_LABELS[r.consent_status]}</span></td>
                <td>{SOURCE_TYPES[r.source_type]}<br /><small>{r.lead_source}</small></td>
              </tr>
            ))}
            {!rows?.length && <tr><td colSpan={5} className="muted">No contacts match. Try a shorter search, or add a contact.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager total={total} page={w.current} pageSize={PAGE_SIZE} base="/contacts" params={params} />
    </>
  );
}
