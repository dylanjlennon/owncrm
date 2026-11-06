import { requireOwner } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { EXPORTS, readAll } from '@/lib/export';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const { db } = await requireOwner();
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = (type: string, name: string) => ({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' });
  if (kind === 'all') {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const e of EXPORTS) out[e.key] = await readAll(db, e.table);
    return new Response(JSON.stringify(out, null, 1), { headers: headers('application/json', `crm-export-${stamp}.json`) });
  }
  const e = EXPORTS.find((x) => x.key === kind);
  if (!e) return new Response('Not found', { status: 404 });
  const rows = await readAll(db, e.table);
  const cols = rows.length ? Object.keys(rows[0]).filter((c) => c !== 'search_text') : ['id'];
  return new Response(toCsv(cols, rows.map((r) => Object.fromEntries(cols.map((c) => [c, typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c]])))), { headers: headers('text/csv; charset=utf-8', `${e.key}-${stamp}.csv`) });
}
