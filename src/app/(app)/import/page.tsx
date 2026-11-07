import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/time';
import { Flash } from '@/components/Flash';
import { uploadCsv, uploadContract } from './actions';
import { SizeCheckedFile } from '@/components/SizeCheckedFile';

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const { data: imports } = await db.from('imports').select('id, kind, filename, status, total_rows, imported_rows, merged_rows, error_rows, created_at').order('created_at', { ascending: false }).limit(20);
  return (
    <>
      <h1>Import</h1>
      <Flash code={sp.msg} />
      <div className="notice">Imported people have unknown consent, so they get no marketing email. Nobody is emailed by an import. Every import can be undone in one click.</div>
      <div className="cols">
        <form action={uploadCsv} className="stack panel">
          <h2 className="u-mt0">A spreadsheet (CSV)</h2>
          <p className="muted">From another CRM or a spreadsheet. You match the columns next, then see a preview.</p>
          <SizeCheckedFile label="CSV file, up to 4 MB" name="file" accept=".csv,text/csv" />
          <button type="submit">Read file</button>
        </form>
        <form action={uploadContract} className="stack panel">
          <h2 className="u-mt0">A rescue folder</h2>
          <p className="muted">The checked folder your AI agent made with the rescue tools. Select every file in the folder.</p>
          <SizeCheckedFile label="Folder files (manifest.json and the .csv files), up to 4 MB in all" name="files" multiple accept=".csv,.json" />
          <button type="submit">Check folder</button>
        </form>
      </div>
      <h2>Recent imports</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>File</th><th>When</th><th>Result</th></tr></thead>
        <tbody>
          {(imports ?? []).map((i: any) => (
            <tr key={i.id}><td><Link href={`/import/${i.id}`}>{i.filename || i.kind}</Link><br /><small>{i.kind}</small></td><td>{formatDateTime(i.created_at, s.timezone)}</td>
              <td><span className={`tag ${i.status === 'done' ? 'ok' : i.status === 'undone' ? 'warn' : ''}`}>{i.status === 'draft' ? 'Not imported yet' : i.status === 'done' ? `${i.imported_rows} new, ${i.merged_rows} merged, ${i.error_rows} refused` : 'Undone'}</span></td></tr>
          ))}
          {!imports?.length && <tr><td colSpan={3} className="muted">No imports yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
