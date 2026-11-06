import { APP_NAME } from '@/lib/config';
import { Flash } from '@/components/Flash';
import { login } from './actions';

// No email is ever filled in here. The page shows nothing about who owns this install.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="public">
      <h1>{APP_NAME}</h1>
      <p className="muted">Sign in, then enter the code from your authenticator app.</p>
      <Flash code={sp.msg} />
      <form action={login} className="stack panel">
        <label>Email<input name="email" type="email" autoComplete="username" required maxLength={320} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
        <button type="submit">Sign in</button>
      </form>
      <p className="muted">Locked out? Follow RECOVERY in the setup guide. There is no reset link on this page on purpose.</p>
    </div>
  );
}
