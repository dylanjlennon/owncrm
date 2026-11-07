// A tiny in-memory stand-in for the Supabase client, enough for the scheduler, alerts and
// go-live logic. Test use only. It is not a database: no RLS, no constraints beyond the hooks.
import { randomUUID } from 'node:crypto';
import { ALERT_POLICY, dayStart } from '@/lib/alerts';

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;
export type FakeDb = ReturnType<typeof fakeDb>;

export function fakeDb(init: {
  tables?: Record<string, Row[]>;
  views?: Record<string, (t: Record<string, Row[]>) => Row[]>;
  rpc?: Record<string, (args: any, t: Record<string, Row[]>) => any>;
  beforeInsert?: Record<string, (row: Row, t: Record<string, Row[]>) => void>;
  defaults?: Record<string, () => Row>;
  /** The time the fake database thinks it is (ms). Default: the real clock. */
  clock?: () => number;
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
      const fn = init.rpc?.[name] ?? (name === 'alert_admit' ? (a: any, t: Record<string, Row[]>) => alertAdmit(a, t, init.clock?.() ?? Date.now()) : undefined);
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

/**
 * A stand-in for public.alert_admit (migration 20261107000300_alert_gate.sql), so unit tests can
 * run the app's alert paths without Postgres. It runs synchronously, which is what the database
 * lock gives the real function. scripts/test-db-local.sh tests the real function, including 40
 * calls at once. Keep the two in step.
 */
function monthStart(now: Date, timeZone: string) {
  const local = new Date(now.toLocaleString('en-US', { timeZone }));
  return dayStart(new Date(now.getTime() - (local.getDate() - 1) * 86400000), timeZone);
}

export function alertAdmit(a: any, t: Record<string, Row[]>, now: number) {
  const s: any = (t.app_settings ?? [])[0] ?? {};
  const outbound = (t.outbound_emails ??= []);
  const iso = (ms: number) => new Date(ms).toISOString();
  const live = outbound.filter((r) => r.status !== 'failed');
  const start = dayStart(new Date(now), s.timezone || 'UTC');
  const to = [...new Set((a.p_to as string[]).filter((x) => x && x.trim()))];
  if (!to.length) return { send: false, reason: 'no_owner' };
  if (a.p_key && live.some((r) => r.alert_key === a.p_key && r.created_at >= iso(now - Number(a.p_dedupe_hours ?? 12) * 3600000))) return { send: false, reason: 'duplicate' };
  if (a.p_key && a.p_daily_max != null) {
    const prefix = `${String(a.p_key).split(':')[0]}:`;
    if (new Set(live.filter((r) => r.created_at >= start && String(r.alert_key ?? '').startsWith(prefix)).map((r) => r.alert_key)).size >= a.p_daily_max) return { send: false, reason: 'daily_max' };
  }
  const today = live.filter((r) => (r.kind === 'alert' || r.kind === 'system') && r.created_at >= start);
  const isLead = (r: Row) => ['lead', 'digest'].includes(r.alert_class ?? (r.lead_id || String(r.subject).startsWith('Many new leads') ? 'lead' : 'system'));
  const total = today.length; const lead = today.filter(isLead).length;
  const criticalUsed = today.filter((r) => r.alert_class === 'critical').length;
  const reminderUsed = today.filter((r) => r.alert_class === 'reminder').length;
  const noticeUsed = today.filter((r) => r.alert_class === 'notice').length;
  const system = total - lead - reminderUsed - noticeUsed;
  const c = { ceiling: ALERT_POLICY.ceiling(s), leadShare: ALERT_POLICY.leadShare(s), systemShare: ALERT_POLICY.systemShare(s), digest: ALERT_POLICY.digestReserve(s),
    critical: ALERT_POLICY.criticalReserve(s), reminder: ALERT_POLICY.reminderReserve(s), notice: ALERT_POLICY.noticeReserve(s) };
  const unusedCrit = Math.max(0, c.critical - criticalUsed); const unusedRem = Math.max(0, c.reminder - reminderUsed); const unusedNotice = Math.max(0, c.notice - noticeUsed);
  const n = to.length; const cls = a.p_class as string;
  const remOver = Math.max(0, reminderUsed - c.reminder);
  const free = c.ceiling - unusedCrit - unusedNotice - unusedRem - total;
  const month = live.filter((r) => r.created_at >= monthStart(new Date(now), s.timezone || 'UTC')).length;
  let room: number;
  if (cls === 'critical') room = Math.min(c.systemShare - system, c.ceiling - total);
  else if (cls === 'system') room = Math.min(c.systemShare - c.critical - system, free);
  else if (cls === 'digest') {
    room = Math.min(c.leadShare - remOver - lead, free);
    const last = today.filter((r) => r.alert_class === 'digest').map((r) => r.created_at).sort().at(-1);
    const hours = Math.max(1, (Date.parse(start) + 86400000 - now) / 3600000 / Math.max(1, c.leadShare - remOver - lead));
    if (last && now - Date.parse(last) < hours * 3600000 - 60000) return { send: false, reason: 'paced', hours };
  } else if (cls === 'lead_reminder') {
    const dayAgo = iso(now - 86400000);
    if (a.p_flood_key && (t.leads ?? []).filter((l) => l.flood_key === a.p_flood_key && l.received_at >= dayAgo).length > ALERT_POLICY.perAddressDay) return { send: false, reason: 'flooded' };
    room = Math.min(c.ceiling - unusedCrit - unusedNotice - total, Math.max(unusedRem, c.leadShare - c.digest - remOver - lead));
  } else {
    const dayAgo = iso(now - 86400000);
    if (a.p_flood_key && new Set(live.filter((r) => r.flood_key === a.p_flood_key && r.alert_class === 'lead' && r.created_at >= dayAgo && r.lead_id !== a.p_lead_id).map((r) => r.lead_id)).size >= ALERT_POLICY.perAddressDay) return { send: false, reason: 'hold' };
    room = Math.min(c.leadShare - c.digest - remOver - lead, free);
  }
  const cap = Number(s.monthly_email_cap ?? Infinity);
  if (room < n || month + n > cap) {
    let notice: any;
    if (s.owner_email && noticeUsed === 0 && total + 1 <= c.ceiling && month + 1 <= cap) {
      const row = { id: randomUUID(), to_address: s.owner_email, subject: 'Alerts paused for today', body_text: a.p_notice_body ?? '', kind: 'alert', status: 'queued',
        lead_id: null, household_id: null, alert_class: 'notice', alert_key: 'alerts_paused', flood_key: null, created_at: iso(now) };
      outbound.push(row);
      notice = { subject: row.subject, emails: [{ id: row.id, to: row.to_address }] };
    }
    return { send: false, reason: cls === 'lead' ? 'hold' : 'ceiling', ...(notice ? { notice } : {}) };
  }
  const emails = to.map((addr) => {
    const row = { id: randomUUID(), to_address: addr, subject: String(a.p_subject).slice(0, 300), body_text: a.p_body, kind: 'alert', status: 'queued',
      lead_id: a.p_lead_id ?? null, household_id: a.p_household_id ?? null, alert_class: cls === 'lead_reminder' ? 'reminder' : cls, alert_key: a.p_key ?? null,
      flood_key: a.p_flood_key ?? null, created_at: iso(now) };
    outbound.push(row);
    return { id: row.id, to: addr };
  });
  return { send: true, emails };
}
