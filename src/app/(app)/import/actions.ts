'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { parseCsv } from '@/lib/csv';
import { IMPORT_FIELDS, splitRows, rowsToContractFiles, errorFile, readErrorFile, screenUpload, readDraft, type Mapping } from '@/lib/importing';
import { validateContract, errorsCsv, CSV_FILES } from '../../../../contract/lib/validate.mjs';
import { undoImport as undo } from '@/lib/undo';
import { IMPORT_MAX_BYTES } from '@/lib/limits';
import { containsSensitive } from '../../../../contract/lib/redact.mjs';
import { mentionsHealthOrLegal } from '../../../../contract/lib/policy.mjs';

const MAX = IMPORT_MAX_BYTES;
// A file name can hold anything. Keep it only if it passes the same checks as a cell.
const safeFilename = (name: string) => { const n = name.slice(0, 200); return containsSensitive(n) || mentionsHealthOrLegal(n) ? 'Spreadsheet' : n; };
const UUID = /^[0-9a-f-]{36}$/i;

export async function uploadCsv(f: FormData) {
  const { db } = await requireOwner();
  const file = f.get('file');
  if (!(file instanceof File) || file.size === 0) redirect('/import?msg=import_empty');
  if (file.size > MAX) redirect('/import?msg=import_too_big');
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) redirect('/import?msg=import_empty');
  // Checked before anything is saved. Rows with an account number, an SSN or health or legal text
  // are not stored at all, only their line number and the reason. The raw file is never stored.
  const { draft, refused } = screenUpload(rows);
  const { data } = await db.from('imports').insert({
    kind: 'csv', filename: safeFilename(file.name), raw_csv: JSON.stringify(draft), total_rows: rows.length - 1,
    error_csv: refused.length ? errorFile(refused) : null, error_rows: refused.length,
  }).select('id').single();
  redirect(`/import/${data!.id}?msg=import_uploaded`);
}

export async function uploadContract(f: FormData) {
  const { db } = await requireOwner();
  const files: Record<string, string | null> = Object.fromEntries(CSV_FILES.map((n) => [n, null]));
  let manifest: string | null = null;
  const extra: string[] = [];
  let total = 0;
  for (const item of f.getAll('files')) {
    if (!(item instanceof File) || item.size === 0) continue;
    total += item.size;
    if (total > MAX) redirect('/import?msg=import_too_big');
    const name = item.name.split(/[\\/]/).pop() || '';
    if (name === 'manifest.json') manifest = await item.text();
    else if (name.endsWith('.csv') && CSV_FILES.includes(name.slice(0, -4))) files[name.slice(0, -4)] = await item.text();
    else if (name !== 'contract-errors.csv') extra.push(name);
  }
  const v = validateContract({ manifest, files, extraFiles: extra });
  const { data } = await db.from('imports').insert({
    kind: 'contract', filename: 'Contract folder', total_rows: v.counts.households ?? 0,
    raw_csv: v.ok ? JSON.stringify(v.data) : null, error_csv: v.ok ? null : errorsCsv(v.errors), error_rows: v.ok ? 0 : v.errors.length,
  }).select('id').single();
  redirect(`/import/${data!.id}`);
}

function readMapping(f: FormData): Mapping {
  const m: Mapping = {};
  for (const k of IMPORT_FIELDS) { const v = f.get(`m_${k}`); if (v !== null && v !== '' && !isNaN(Number(v))) m[k] = Number(v); }
  return m;
}

export async function commitImport(f: FormData) {
  const { db } = await requireOwner();
  const id = String(f.get('id') || '');
  if (!UUID.test(id)) redirect('/import?msg=bad_input');
  const { data: imp } = await db.from('imports').select('*').eq('id', id).eq('status', 'draft').single();
  if (!imp) redirect('/import?msg=bad_input');
  let payload: Record<string, any> = {};
  let errorCsv: string | null = null;
  let errorRows = 0;
  if (imp.kind === 'csv') {
    const draft = readDraft(imp.raw_csv);
    if (!draft) redirect(`/import/${id}?msg=import_expired`);
    const mapping = readMapping(f);
    const { good, bad } = splitRows(draft!.rows, mapping, draft!.lines);
    const c = rowsToContractFiles(good);
    const v = validateContract({ manifest: c.manifest, files: c.files });
    if (!v.ok) redirect(`/import/${id}?msg=bad_input`);
    payload = v.data;
    // Rows refused on upload, plus rows refused now that the columns are matched.
    const all = [...readErrorFile(imp.error_csv), ...bad];
    errorCsv = all.length ? errorFile(all) : null;
    errorRows = all.length;
    await db.from('imports').update({ mapping }).eq('id', id);
  } else {
    payload = JSON.parse(imp.raw_csv || 'null');
    if (!payload) redirect(`/import/${id}?msg=bad_input`);
  }
  const { error } = await db.rpc('import_contract', { p: payload!, p_import: id });
  if (error) redirect(`/import/${id}?msg=bad_input`);
  // import_contract already cleared the stored rows; clear them here too, whatever happened.
  await db.from('imports').update({ raw_csv: null, error_csv: errorCsv ?? imp.error_csv, error_rows: imp.kind === 'csv' ? errorRows : imp.error_rows }).eq('id', id);
  revalidatePath('/', 'layout');
  redirect(`/import/${id}?msg=import_done`);
}

export async function undoImport(f: FormData) {
  const { db } = await requireOwner();
  const id = String(f.get('id') || '');
  if (!UUID.test(id)) redirect('/import?msg=bad_input');
  await undo(db, id);
  await db.from('history_batches').update({ status: 'undone', undone_at: new Date().toISOString() }).eq('import_id', id);
  revalidatePath('/', 'layout');
  redirect(`/import/${id}?msg=import_undone`);
}
