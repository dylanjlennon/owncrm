import 'server-only';
import { redirect } from 'next/navigation';
import { sessionClient } from './supabase/server';

// Every owner page and action starts here. The database enforces the same rule
// on every row, so a missed check here still can't leak data.
export async function requireOwner() {
  const db = await sessionClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') redirect('/mfa');
  const { data: owner } = await db.from('app_owner').select('user_id').maybeSingle();
  if (!owner) redirect('/login?msg=not_owner');
  return { db, user };
}
