'use client';
import { useActionState } from 'react';
import { createToken } from './actions';

// Creates a history token and shows it once, right here. It is never put in a URL.
export function NewTokenForm() {
  const [state, action, pending] = useActionState(createToken, { token: null as string | null });
  return (
    <>
      {state.token && (
        <div className="notice warn" role="status">
          <strong>Copy this token now. It will not be shown again.</strong>
          <p><code data-testid="new-token">{state.token}</code></p>
          <p>Paste it only into the rescue tool on your computer, as OWNCRM_HISTORY_TOKEN. Don&apos;t paste it into a chat.</p>
        </div>
      )}
      <form action={action} className="row panel">
        <label style={{ flex: '1 1 200px' }}>Name<input name="label" defaultValue="My computer" maxLength={80} /></label>
        <label>Expires in<select name="days" defaultValue="30"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
        <button type="submit" disabled={pending}>Create a token</button>
      </form>
    </>
  );
}
