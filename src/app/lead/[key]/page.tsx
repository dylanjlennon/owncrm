import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { constantTimeEqual } from '@/lib/secure';
import { getSettings } from '@/lib/settings';

// PUBLIC: the hosted lead form. The consent box starts unchecked, and the words beside it
// are the exact words stored with the lead.
export const dynamic = 'force-dynamic';

export default async function LeadForm({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const { key } = await params;
  const sp = await searchParams;
  if (!constantTimeEqual(key, env.leadFormKey())) notFound();
  const s = await getSettings(serviceClient());
  const source = String(sp.source || 'Website form').replace(/[^\w .,'-]/g, '').slice(0, 80);
  return (
    <div className="public">
      <h1>{s.display_name ? `Contact ${s.display_name}` : 'Get in touch'}</h1>
      <form method="post" action="/api/lead" className="stack panel">
        <input type="hidden" name="key" value={key} />
        <input type="hidden" name="source" value={source} />
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <div className="row"><label style={{ flex: 1 }}>First name<input name="first_name" required maxLength={100} autoComplete="given-name" /></label><label style={{ flex: 1 }}>Last name<input name="last_name" maxLength={100} autoComplete="family-name" /></label></div>
        <label>Email<input name="email" type="email" maxLength={320} autoComplete="email" /></label>
        <label>Phone<input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
        <label>Message<textarea name="message" maxLength={2000} /></label>
        <label className="check"><input type="checkbox" name="consent" value="yes" /> {s.form_consent_wording}</label>
        <button type="submit">Send</button>
        <small className="muted">Give an email or a phone number so we can reply.</small>
      </form>
    </div>
  );
}
