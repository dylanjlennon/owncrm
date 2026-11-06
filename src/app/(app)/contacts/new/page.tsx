import { requireOwner } from '@/lib/auth';
import { Flash } from '@/components/Flash';
import { STAGES } from '@/lib/config';
import { createContact } from '../actions';

export default async function NewContact({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireOwner();
  const sp = await searchParams;
  return (
    <>
      <h1>Add a contact</h1>
      <Flash code={sp.msg} />
      <form action={createContact} className="stack panel">
        <div className="row"><label style={{ flex: 1 }}>First name<input name="first_name" required maxLength={100} /></label><label style={{ flex: 1 }}>Last name<input name="last_name" maxLength={100} /></label></div>
        <label>Email<input name="email" type="email" maxLength={320} /></label>
        <label>Phone<input name="phone" type="tel" maxLength={40} /></label>
        <label>Stage<select name="stage" defaultValue="new lead">{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Where they came from<input name="lead_source" maxLength={200} placeholder="Open house, referral from a past client" /></label>
        <label>Source type<select name="source_type" defaultValue="personal"><option value="personal">Personal</option><option value="firm_provided">Firm-provided</option><option value="portal">Portal</option><option value="unknown">Not stated</option></select></label>
        <fieldset className="panel"><legend>Marketing email consent</legend>
          <label className="check"><input type="radio" name="consent" value="unknown" defaultChecked /> Unknown. No marketing email.</label>
          <label className="check"><input type="radio" name="consent" value="opted_in" /> They agreed to marketing email</label>
          <label>How and when they agreed<input name="consent_source" maxLength={300} placeholder="Signed open house sheet, Nov 6" /></label>
          <label>Exact wording they agreed to, if any<input name="consent_wording" maxLength={1000} /></label>
        </fieldset>
        <div className="row"><label>First follow-up<input name="followup_on" type="date" /></label><label style={{ flex: 1 }}>What to do<input name="followup_title" maxLength={300} placeholder="Call back" /></label></div>
        <button type="submit">Add contact</button>
      </form>
    </>
  );
}
