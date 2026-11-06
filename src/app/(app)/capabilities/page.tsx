import { requireOwner } from '@/lib/auth';
import { CAPABILITIES } from '@/lib/capabilities';
import { CostTable, WhoShouldNot } from '@/components/CostTable';

export default async function Capabilities() {
  await requireOwner();
  return (
    <>
      <h1>What this can and can&apos;t do</h1>
      <p>Can means it works today. Later means possible with time or money. Can&apos;t means technically closed or outside our control. Won&apos;t means a deliberate choice.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Item</th><th>Verdict</th><th>Plain truth</th></tr></thead>
        <tbody>{CAPABILITIES.map((c) => <tr key={c.item}><td>{c.item}</td><td><span className={`tag ${c.verdict === 'Can' ? 'ok' : c.verdict === 'Later' ? 'warn' : 'bad'}`}>{c.verdict}</span></td><td>{c.truth}</td></tr>)}</tbody>
      </table></div>
      <h2>Who should not use this</h2>
      <WhoShouldNot />
      <h2>What it costs</h2>
      <CostTable />
      <h2>Source code and license</h2>
      <p>AGPL-3.0, no warranty, not legal advice. {process.env.SOURCE_URL ? <a href={process.env.SOURCE_URL}>Source code for this install</a> : 'Set SOURCE_URL in your hosting settings to link the source code here, as the AGPL asks when others use your copy.'}</p>
    </>
  );
}
