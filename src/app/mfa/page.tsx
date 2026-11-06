import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';
import { Flash } from '@/components/Flash';
import { verifyCode } from './actions';

// Second factor is required. First visit sets up the authenticator app.
export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const db = await sessionClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') redirect('/today');
  const { data: factors } = await db.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((f) => f.status === 'verified');

  if (verified.length) {
    return (
      <div className="public">
        <h1>Enter your code</h1>
        <Flash code={sp.msg} />
        <form action={verifyCode} className="stack panel">
          <input type="hidden" name="factorId" value={verified[0].id} />
          <label>6-digit code from your authenticator app
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
          </label>
          <button type="submit">Continue</button>
        </form>
      </div>
    );
  }

  // Start fresh each time so an abandoned setup never lingers.
  for (const f of factors?.all ?? []) if (f.status !== 'verified') await db.auth.mfa.unenroll({ factorId: f.id });
  const { data: enroll, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error || !enroll) return <div className="public"><h1>Set up two-step sign-in</h1><p className="flash bad">Could not start setup. Check that TOTP is turned on in Supabase, Authentication, Multi-Factor.</p></div>;
  return (
    <div className="public">
      <h1>Set up two-step sign-in</h1>
      <p>Scan this with an authenticator app (1Password, Google Authenticator, Authy). Save the setup key in your password manager too: it is your way back in if you lose your phone.</p>
      <Flash code={sp.msg} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={enroll.totp.qr_code} alt="QR code for your authenticator app" />
      <p>Setup key: <code data-testid="totp-secret">{enroll.totp.secret}</code></p>
      <form action={verifyCode} className="stack panel">
        <input type="hidden" name="factorId" value={enroll.id} />
        <label>Code shown in the app<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
        <button type="submit">Turn on two-step sign-in</button>
      </form>
    </div>
  );
}
