// PUBLIC: landing page for the "I replied" link. Mail scanners open links, so the change
// happens only when a person presses the button. It does not log anyone in.
export default async function Replied({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="public">
      <h1>Mark this lead as replied?</h1>
      <p>This stops the no-reply reminders for this one lead. It does not sign you in.</p>
      <form method="post" action="/api/r/replied" className="panel"><input type="hidden" name="t" value={String(sp.t || '').slice(0, 2000)} /><button type="submit">Yes, I replied</button></form>
    </div>
  );
}
