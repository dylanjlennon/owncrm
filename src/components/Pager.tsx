import Link from 'next/link';
import { pageWindow } from '@/lib/logic';

// Shows the true total. A capped list never pretends to be the whole list.
export function Pager({ total, page, pageSize, base, params }: { total: number; page: number; pageSize: number; base: string; params?: Record<string, string> }) {
  const w = pageWindow(page, pageSize, total);
  const href = (p: number) => `${base}?${new URLSearchParams({ ...(params || {}), page: String(p) }).toString()}`;
  return (
    <div className="pager" aria-label="Pages">
      <span data-testid="total">Showing {w.firstShown} to {w.lastShown} of {total}</span>
      {w.current > 1 && <Link href={href(w.current - 1)}>Previous page</Link>}
      {w.current < w.pages && <Link href={href(w.current + 1)}>Next page</Link>}
      <span className="muted">Page {w.current} of {w.pages}</span>
    </div>
  );
}
