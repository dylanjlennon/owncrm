// A tiny in-memory stand-in for the Supabase client, enough for the scheduler, alerts and
// go-live logic. Test use only. It is not a database: no RLS, no constraints beyond the hooks.
import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;
export type FakeDb = ReturnType<typeof fakeDb>;

export function fakeDb(init: {
  tables?: Record<string, Row[]>;
  views?: Record<string, (t: Record<string, Row[]>) => Row[]>;
  rpc?: Record<string, (args: any, t: Record<string, Row[]>) => any>;
  beforeInsert?: Record<string, (row: Row, t: Record<string, Row[]>) => void>;
  defaults?: Record<string, () => Row>;
} = {}) {
  const tables: Record<string, Row[]> = { ...(init.tables ?? {}) };
  let seq = 1;
  const table = (name: string) => (tables[name] ??= []);

  function query(name: string) {
    const filters: Filter[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let order: { col: string; asc: boolean; nullsFirst?: boolean } | null = null;
    let lim: number | null = null;
    let single: 'one' | 'maybe' | null = null;
    let returning = false;
    let countOpt = false; let head = false;
    const cmp = (a: any, b: any) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1);

    const q: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (mode !== 'select') returning = true;
        if (opts?.count) countOpt = true;
        if (opts?.head) head = true;
        return q;
      },
      insert(p: Row | Row[]) { mode = 'insert'; payload = p; return q; },
      upsert(p: Row | Row[]) { mode = 'insert'; payload = p; return q; },
      update(p: Row) { mode = 'update'; payload = p; return q; },
      delete() { mode = 'delete'; return q; },
      eq(c: string, v: any) { filters.push((r) => r[c] === v); return q; },
      neq(c: string, v: any) { filters.push((r) => r[c] !== v); return q; },
      is(c: string, v: any) { filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return q; },
      not(c: string, op: string, v: any) {
        if (op === 'is' && v === null) filters.push((r) => r[c] !== null && r[c] !== undefined);
        else if (op === 'like') { const re = new RegExp(`^${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`); filters.push((r) => !re.test(String(r[c] ?? ''))); }
        else filters.push((r) => r[c] !== v);
        return q;
      },
      gte(c: string, v: any) { filters.push((r) => r[c] != null && r[c] >= v); return q; },
      gt(c: string, v: any) { filters.push((r) => r[c] != null && r[c] > v); return q; },
      lte(c: string, v: any) { filters.push((r) => r[c] != null && r[c] <= v); return q; },
      lt(c: string, v: any) { filters.push((r) => r[c] != null && r[c] < v); return q; },
      in(c: string, v: any[]) { filters.push((r) => v.includes(r[c])); return q; },
      like(c: string, v: string) { const re = new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`); filters.push((r) => re.test(String(r[c] ?? ''))); return q; },
      order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) { order = { col, asc: o?.ascending !== false, nullsFirst: o?.nullsFirst }; return q; },
      limit(n: number) { lim = n; return q; },
      single() { single = 'one'; return q; },
      maybeSingle() { single = 'maybe'; return q; },
      then(resolve: (v: any) => any, reject?: (e: any) => any) {
        try { return Promise.resolve(run()).then(resolve, reject); } catch (e) { return reject ? reject(e) : Promise.reject(e); }
      },
    };

    function source(): Row[] {
      if (init.views?.[name]) return init.views[name](tables);
      return table(name);
    }
    function run() {
      if (mode === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const out: Row[] = [];
        for (const p of rows) {
          const row: Row = { id: name === 'job_runs' ? seq++ : randomUUID(), ...(init.defaults?.[name]?.() ?? {}), ...p };
          try { init.beforeInsert?.[name]?.(row, tables); } catch (e: any) { return { data: null, error: { message: e.message } }; }
          table(name).push(row); out.push(row);
        }
        return finish(out);
      }
      let rows = source().filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of rows) Object.assign(r, payload); return finish(returning ? rows : []); }
      if (mode === 'delete') { tables[name] = table(name).filter((r) => !rows.includes(r)); return finish(returning ? rows : []); }
      if (order) {
        const { col, asc, nullsFirst } = order;
        rows = [...rows].sort((a, b) => {
          const an = a[col] == null; const bn = b[col] == null;
          if (an !== bn) return (an ? -1 : 1) * (nullsFirst === false ? -1 : nullsFirst === true ? 1 : asc ? 1 : -1);
          return asc ? cmp(a[col], b[col]) : cmp(b[col], a[col]);
        });
      }
      const count = rows.length;
      if (lim !== null) rows = rows.slice(0, lim);
      if (head) return { data: null, error: null, count };
      return finish(rows, countOpt ? count : undefined);
    }
    function finish(rows: Row[], count?: number) {
      if (single === 'one') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row, got ${rows.length}` } };
      if (single === 'maybe') return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null, count };
    }
    return q;
  }

  return {
    tables,
    from: (name: string) => query(name),
    rpc: async (name: string, args?: any) => {
      const fn = init.rpc?.[name];
      if (!fn) return { data: null, error: { message: `no rpc ${name}` } };
      try { return { data: await fn(args, tables), error: null }; } catch (e: any) { return { data: null, error: { message: e.message } }; }
    },
  };
}

/** The job status view, computed the same way as the SQL view. */
export function jobStatusView(t: Record<string, Row[]>) {
  const runs = (t.job_runs ?? []).filter((r) => r.finished_at);
  const jobs = [...new Set(runs.map((r) => r.job))];
  return jobs.map((job) => {
    const mine = runs.filter((r) => r.job === job).sort((a, b) => (a.finished_at < b.finished_at ? 1 : -1));
    return {
      job,
      last_success_at: mine.find((r) => r.ok === true)?.finished_at ?? null,
      last_failure_at: mine.find((r) => r.ok === false)?.finished_at ?? null,
      last_ok: mine[0]?.ok ?? null,
      last_detail: mine[0]?.detail ?? null,
    };
  });
}
