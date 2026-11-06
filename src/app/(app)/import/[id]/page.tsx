import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { parseCsv } from '@/lib/csv';
import { IMPORT_FIELDS, guessMapping, splitRows, type Mapping } from '@/lib/importing';
import { Flash } from '@/components/Flash';
import { commitImport, undoImport } from '../actions';

const LABELS: Record<string, string> = { first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Phone', notes: 'Notes', stage: 'Stage', lead_source: 'Where they came from', source_type: 'Source type' };

export default async function ImportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireOwner();
  const { data: imp } = await db.from('imports').select('*').eq('id', id).maybeSingle();
  if (!imp) notFound();
  const errorLink = imp.error_csv ? <a className="button quiet" href={`/api/import/errors/${id}`}>Download the error file</a> : null;

  if (imp.status !== 'draft') {
    return (
      <>
        <h1>Import: {imp.filename}</h1>
        <Flash code={sp.msg} />
        <div className="panel">
          <p data-testid="import-result">{imp.status === 'undone' ? 'This import was undone.' : `${imp.imported_rows} new contacts, ${imp.merged_rows} merged into existing contacts, ${imp.error_rows} rows refused.`}</p>
          <p className="muted">Nobody was emailed. Consent is unknown for everyone imported.</p>
          <div className="row">{errorLink}
            {imp.status === 'done' && <form action={undoImport}><input type="hidden" name="id" value={id} /><button className="danger" type="submit">Undo this import</button></form>}</div>
        </div>
      </>
    );
  }
  if (imp.kind === 'contract') {
    const payload = imp.raw_csv ? JSON.parse(imp.raw_csv) : null;
    return (
      <>
        <h1>Rescue folder check</h1>
        <Flash code={sp.msg} />
        {payload ? (
          <div className="panel">
            <p data-testid="contract-ok">The folder passed the check: {payload.households.length} households, {payload.people.length} people, {payload.contact_methods.length} emails and phones, {payload.interactions.length} summaries, {payload.suppressions.length} opt-outs.</p>
            <form action={commitImport}><input type="hidden" name="id" value={id} /><button type="submit">Import {payload.households.length} households</button></form>
          </div>
        ) : (
          <div className="panel"><p className="flash bad" data-testid="contract-bad">The folder did not pass the check. Nothing was imported. The error file lists each problem by file, line and column.</p>{errorLink}</div>
        )}
      </>
    );
  }
  const rows = parseCsv(imp.raw_csv || '');
  const headers = rows[0] || [];
  const guessed = guessMapping(headers);
  const mapping: Mapping = { ...guessed };
  for (const k of IMPORT_FIELDS) if (sp[`m_${k}`] !== undefined) { const n = Number(sp[`m_${k}`]); if (sp[`m_${k}`] === '') delete mapping[k]; else if (!isNaN(n)) mapping[k] = n; }
  const { good, bad } = splitRows(rows.slice(1), mapping);
  return (
    <>
      <h1>Match columns: {imp.filename}</h1>
      <Flash code={sp.msg} />
      <form className="panel stack" method="get">
        <div className="cols">
          {IMPORT_FIELDS.map((k) => (
            <label key={k}>{LABELS[k]}<select name={`m_${k}`} defaultValue={mapping[k] ?? ''}><option value="">Not in this file</option>{headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></label>
          ))}
        </div>
        <button className="quiet" type="submit">Update preview</button>
      </form>
      <p data-testid="import-preview"><strong>{good.length}</strong> rows ready. <strong>{bad.length}</strong> rows have problems and will go in the error file. {rows.length - 1} rows in the file.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Stage</th></tr></thead>
        <tbody>{good.slice(0, 10).map((g, i) => <tr key={i}><td>{g.display_name}</td><td>{g.email}</td><td>{g.phone}</td><td>{g.stage}</td></tr>)}</tbody>
      </table></div>
      {bad.length > 0 && <><h2>First problems</h2><ul>{bad.slice(0, 5).map((b) => <li key={b.line}>Line {b.line}: {b.reason}</li>)}</ul></>}
      <form action={commitImport} className="row panel">
        <input type="hidden" name="id" value={id} />
        {IMPORT_FIELDS.map((k) => <input key={k} type="hidden" name={`m_${k}`} value={mapping[k] ?? ''} />)}
        <button type="submit">Import {good.length} rows</button>
        <span className="muted">Consent will be unknown for all of them. Nobody is emailed.</span>
      </form>
    </>
  );
}
