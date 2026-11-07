import { HISTORY_SOURCES } from '../../../contract/lib/policy.mjs';
import { validateContract, CSV_FILES } from '../../../contract/lib/validate.mjs';
import { containsSensitive } from '../../../contract/lib/redact.mjs';
import { mentionsHealthOrLegal } from '../../../contract/lib/policy.mjs';

// The run detail is shown on Status and stored. The rescue tool fills it with error messages that
// can quote a file, so anything that looks like personal data is replaced, not stored.
export const HIDDEN_DETAIL = 'Details hidden: they looked like personal data. Check the log on your computer.';
export function safeRunDetail(v: unknown): string {
  const d = String(v ?? '').slice(0, 300);
  return containsSensitive(d) || mentionsHealthOrLegal(d) ? HIDDEN_DETAIL : d;
}

// What the rescue tool may send. Anything outside this shape is refused whole.
const TOP = ['client_batch_id', 'source', 'range_start', 'range_end', 'run', 'contract'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateHistoryUpload(body: unknown):
  { ok: false; reason: string; errors?: any[] } |
  { ok: true; batchId: string; source: string; rangeStart: string | null; rangeEnd: string | null; run: { ok: boolean; detail: string }; data: Record<string, any> | null; households: number } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'Body must be an object' };
  const b = body as Record<string, any>;
  const extra = Object.keys(b).filter((k) => !TOP.includes(k));
  if (extra.length) return { ok: false, reason: `Unknown fields: ${extra.slice(0, 5).join(', ')}` };
  if (typeof b.client_batch_id !== 'string' || !/^[A-Za-z0-9_.:-]{8,80}$/.test(b.client_batch_id)) return { ok: false, reason: 'client_batch_id is missing or malformed' };
  if (typeof b.source !== 'string' || !HISTORY_SOURCES.includes(b.source)) return { ok: false, reason: 'Unknown source' };
  for (const k of ['range_start', 'range_end']) if (b[k] != null && !(typeof b[k] === 'string' && DATE.test(b[k]))) return { ok: false, reason: `${k} must be YYYY-MM-DD` };
  const run = b.run ?? { ok: true, detail: '' };
  if (typeof run !== 'object' || typeof run.ok !== 'boolean' || Object.keys(run).some((k) => !['ok', 'detail'].includes(k))) return { ok: false, reason: 'run must be {ok, detail}' };
  const base = { ok: true as const, batchId: b.client_batch_id, source: b.source, rangeStart: b.range_start ?? null, rangeEnd: b.range_end ?? null, run: { ok: run.ok, detail: safeRunDetail(run.detail) } };
  if (b.contract == null) return { ...base, data: null, households: 0 };
  const c = b.contract;
  if (typeof c !== 'object' || Object.keys(c).some((k) => !['manifest', 'files'].includes(k)) || typeof c.files !== 'object') return { ok: false, reason: 'contract must be {manifest, files}' };
  const extraFiles = Object.keys(c.files).filter((k) => !CSV_FILES.includes(k)).map((k) => `${k}`);
  const files: Record<string, string | null> = {};
  for (const n of CSV_FILES) files[n] = typeof c.files[n] === 'string' ? c.files[n] : null;
  const v = validateContract({ manifest: typeof c.manifest === 'string' ? c.manifest : JSON.stringify(c.manifest ?? null), files, extraFiles });
  if (!v.ok) return { ok: false, reason: 'The contract folder did not pass the check', errors: v.errors.slice(0, 50) };
  return { ...base, data: v.data, households: v.counts.households };
}
