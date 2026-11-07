import { requireOwner } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';
import { CostTable, WhoShouldNot } from '@/components/CostTable';
import { Flash } from '@/components/Flash';
import { acknowledge } from './actions';

const ZONES = ['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'];

export default async function Welcome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireOwner();
  const sp = await searchParams;
  return (
    <main className="u-mauto">
      <h1>Before you start with {APP_NAME}</h1>
      <Flash code={sp.msg} />
      <h2>Who should not use this</h2>
      <WhoShouldNot />
      <h2>What it really costs each month</h2>
      <CostTable />
      <h2>Your firm comes first</h2>
      <p>Read your independent contractor agreement and ask your broker-in-charge before you put client data here. Leads your firm gave you may belong to the firm. This app is not your transaction file and not your firm&apos;s official record. This is not legal advice.</p>
      <form action={acknowledge} className="stack panel">
        <label>Your time zone (every due date uses it)
          <select name="timezone" defaultValue="America/New_York">{ZONES.map((z) => <option key={z}>{z}</option>)}</select>
        </label>
        <label className="check"><input type="checkbox" name="costs" value="yes" required /> I read the costs and who should not use this. I know I am the one who keeps it running.</label>
        <label className="check"><input type="checkbox" name="policy" value="yes" required /> I will check my firm&apos;s agreement and policy before I add client data.</label>
        <button type="submit">Continue to settings</button>
      </form>
    </main>
  );
}
