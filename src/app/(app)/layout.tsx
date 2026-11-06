import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';
import { getCounts } from '@/lib/counts';
import { getSettings } from '@/lib/settings';
import { loadHealth } from '@/lib/health-load';
import { failingChecks } from '@/lib/health';
import { env } from '@/lib/env';
import { logout } from '../login/actions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireOwner();
  const settings = await getSettings(db);
  if (!settings.first_run_ack_at) redirect('/welcome');
  const [counts, checks] = await Promise.all([getCounts(db), loadHealth(db, settings)]);
  const failing = failingChecks(checks);
  const path = (await headers()).get('x-pathname') || '';
  const nav: [string, string, number?][] = [
    ['/today', 'Today', counts.followups_due + counts.unreplied_leads + counts.deal_dates_soon],
    ['/contacts', 'Contacts'], ['/deals', 'Deals'], ['/review', 'Needs review', counts.needs_review],
    ['/emails', 'Email'], ['/import', 'Import'], ['/history', 'Connect your history'], ['/cleanup', 'Cleanup', counts.open_findings],
  ];
  const nav2: [string, string][] = [['/status', 'Status'], ['/export', 'Export'], ['/settings', 'Settings'], ['/capabilities', 'What this can and can\'t do']];
  const link = ([href, label, n]: [string, string, number?]) => (
    <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}>
      <span>{label}</span>{n ? <span className="badge">{n}</span> : null}
    </Link>
  );
  const menu = (
    <>
      {nav.map(link)}
      <hr />
      {nav2.map((n) => link(n))}
      <hr />
      <form action={logout}><button className="quiet" type="submit">Sign out</button></form>
    </>
  );
  return (
    <>
      {env.demoMode() && <div className="demo" role="note">Demo data. Every name, email and phone here is fake.</div>}
      <div className={`strip ${failing.length ? 'bad' : ''}`} role={failing.length ? 'alert' : 'status'} data-testid="health-strip">
        {failing.length
          ? <span>Something is broken: {failing.map((f) => f.label).join(', ')}. <Link href="/status">Open Status</Link></span>
          : <span>All checks passing. <Link href="/status">Status</Link></span>}
        {!settings.golive_completed_at && <span>Go-live checks not finished.</span>}
        <span className="who">You are the IT department.</span>
      </div>
      <div className="shell">
        <aside className="rail">
          <Link className="brand" href="/today">{APP_NAME}</Link>
          <nav aria-label="Main" className="nav-desktop">{menu}</nav>
          <details className="nav-phone">
            <summary><span className="menu-toggle">Menu</span></summary>
            <nav aria-label="Main">{menu}</nav>
          </details>
        </aside>
        <main>{children}</main>
      </div>
    </>
  );
}
