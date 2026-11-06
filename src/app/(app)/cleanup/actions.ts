'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { runJob } from '@/lib/jobs';

export async function runCleanup() {
  const { db } = await requireOwner();
  await runJob(db, 'hygiene', async () => {
    const { data, error } = await db.rpc('run_hygiene');
    return error ? { ok: false, detail: error.message } : { ok: true, detail: `Cleanup added ${data.added} and closed ${data.fixed} findings.` };
  });
  revalidatePath('/', 'layout');
  redirect('/cleanup?msg=cleanup_ran');
}
export async function setFinding(f: FormData) {
  const { db } = await requireOwner();
  const id = Number(f.get('id'));
  const status = f.get('status') === 'ignored' ? 'ignored' : 'open';
  if (Number.isInteger(id)) await db.from('hygiene_findings').update({ status, resolved_at: status === 'ignored' ? new Date().toISOString() : null }).eq('id', id);
  revalidatePath('/', 'layout');
  redirect(`/cleanup?msg=${status === 'ignored' ? 'finding_ignored' : 'finding_reopened'}`);
}
