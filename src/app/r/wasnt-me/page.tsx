// PUBLIC: landing page for the "wasn't me" link in a new sign-in email.
export default async function WasntMe({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="public">
      <h1>End every session?</h1>
      <p>This signs out every device, including yours. Then change your password in Supabase (see the recovery steps in SECURITY.md).</p>
      <form method="post" action="/api/r/wasnt-me" className="panel"><input type="hidden" name="t" value={String(sp.t || '').slice(0, 2000)} /><button className="danger" type="submit">Sign out everywhere</button></form>
    </div>
  );
}
