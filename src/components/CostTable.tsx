// Real monthly costs, from the providers' own pricing pages as of November 2026. Check them.
export function CostTable() {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Part</th><th>Safe setup</th><th>Free plan catch</th></tr></thead>
        <tbody>
          <tr><td>Vercel (runs the app)</td><td>Pro, $20 a month</td><td>Hobby is for non-commercial use under Vercel&apos;s own terms. A CRM you earn commissions with is commercial. Hobby scheduled jobs also run only once a day.</td></tr>
          <tr><td>Supabase (the database)</td><td>Pro, $25 a month</td><td>Free has no automatic backups and pauses after about a week of low activity. A paused database means lost leads.</td></tr>
          <tr><td>Resend (email)</td><td>$0 to $20 a month</td><td>Free allows 100 emails a day and 3,000 a month, shared by alerts and client email.</td></tr>
          <tr><td>Healthchecks.io (watchdog)</td><td>$0</td><td>The free plan covers this app&apos;s checks.</td></tr>
          <tr><td>GitHub (code and nightly backup)</td><td>$0</td><td>Use a private repository.</td></tr>
          <tr><td>Domain you control</td><td>About $1 to $2 a month</td><td>Needed to send email. A Gmail address or a brokerage domain without DNS access won&apos;t work.</td></tr>
          <tr><th>Total</th><th>About $45 to $65 a month</th><th>Ownership and control, not savings.</th></tr>
        </tbody>
      </table>
    </div>
  );
}
export function WhoShouldNot() {
  return (
    <ul>
      <li>You buy Zillow leads. Zillow Premier Agent buyer leads don&apos;t flow in directly.</li>
      <li>You run a team, route leads, or need an assistant login. One login per install.</li>
      <li>You rely on texting from the CRM. There is no texting.</li>
      <li>You don&apos;t want to own a system. You are the IT department. Nobody else watches it, and there is no support line.</li>
    </ul>
  );
}
