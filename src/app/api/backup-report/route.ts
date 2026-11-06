import { serviceClient } from '@/lib/supabase/service';
import { emailAdapter } from '@/lib/email';
import { env } from '@/lib/env';
import { bearerMatches } from '@/lib/secure';
import { json, readLimited, ipBucket } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { sendAlert } from '@/lib/alerts';

// PUBLIC: the backup workflow reports its checked result here with BACKUP_REPORT_SECRET.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!bearerMatches(req.headers.get('authorization'), env.backupReportSecret())) return json({ error: 'Unauthorized' }, 401);
  const body = await readLimited(req, 8 * 1024);
  if (body === null) return json({ error: 'Too large' }, 413);
  const db = serviceClient();
  if ((await db.rpc('hit_rate_limit', { p_bucket: ipBucket(req, 'backup'), p_max: 20, p_window_seconds: 3600 })).data !== true) return json({ error: 'Too many' }, 429);
  let r: any;
  try { r = JSON.parse(body); } catch { return json({ error: 'Unreadable' }, 400); }
  const ok = r?.ok === true;
  const detail = String(r?.detail || (ok ? 'Backup checked.' : 'Backup failed.')).slice(0, 500);
  await db.from('job_runs').insert({ job: 'backup', ok, detail, finished_at: new Date().toISOString() });
  if (!ok) {
    const s = await getSettings(db);
    await sendAlert(db, emailAdapter(), s, env.appUrl(), { subject: 'Backup failed', text: `${detail}\n\nOpen Status: ${env.appUrl()}/status`, alsoBackup: true });
  }
  return json({ ok: true });
}
