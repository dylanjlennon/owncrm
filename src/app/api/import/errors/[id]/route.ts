import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const { db } = await requireOwner();
  const { data } = await db.from('imports').select('error_csv').eq('id', id).maybeSingle();
  if (!data?.error_csv) return new Response('Not found', { status: 404 });
  return new Response(data.error_csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="import-errors-${id.slice(0, 8)}.csv"`, 'Cache-Control': 'private, no-store' } });
}
