// PUBLIC: the unsubscribe page from a marketing email. One button, nothing else.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const t = String(sp.t || '').slice(0, 2000);
  return (
    <div className="public">
      <h1>Unsubscribe</h1>
      <p>Press the button to stop marketing email to this address.</p>
      <form method="post" action="/api/unsubscribe" className="panel"><input type="hidden" name="t" value={t} /><button type="submit">Unsubscribe</button></form>
    </div>
  );
}
