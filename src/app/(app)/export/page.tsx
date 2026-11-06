import { requireOwner } from '@/lib/auth';
import { EXPORTS } from '@/lib/export';

export default async function ExportPage() {
  await requireOwner();
  return (
    <>
      <h1>Export everything</h1>
      <p>Your data is yours. Each file is a spreadsheet-safe CSV: cells that could run as a formula in Excel are made plain text. The full export holds every table, including consent history and the opt-out list.</p>
      <ul className="list panel">
        {/* Downloads, not pages, so plain links are right here. */}
        {/* eslint-disable @next/next/no-html-link-for-pages */}
        {EXPORTS.map((e) => <li key={e.key}><span className="grow">{e.label}</span><a className="button quiet" href={`/api/export/${e.key}`}>Download CSV</a></li>)}
        <li><span className="grow"><strong>Everything in one file (JSON)</strong></span><a className="button" href="/api/export/all">Download all</a></li>
        {/* eslint-enable @next/next/no-html-link-for-pages */}
      </ul>
      <div className="notice">Store exports somewhere safe. They hold client contact details. Exports are not backups: set up the nightly backup too (HOW-TO.md).</div>
    </>
  );
}
