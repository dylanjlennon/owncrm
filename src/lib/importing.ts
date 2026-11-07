import { toCsv } from './csv';
import { CONTRACT_VERSION } from '../../contract/lib/validate.mjs';
import { containsSensitive } from '../../contract/lib/redact.mjs';
import { mentionsProtectedTrait, looksLikeInstructions, mentionsHealthOrLegal } from '../../contract/lib/policy.mjs';

// A mapped spreadsheet becomes a contract, then goes through the one importer.
export const IMPORT_FIELDS = ['first_name','last_name','email','phone','notes','stage','lead_source','source_type'] as const;
export type ImportField = typeof IMPORT_FIELDS[number];
export type Mapping = Partial<Record<ImportField, number>>;

const GUESS: Record<ImportField, RegExp> = {
  first_name: /^(first|first ?name|given|name)$/i, last_name: /^(last|last ?name|surname|family ?name)$/i,
  email: /e-?mail/i, phone: /(phone|mobile|cell|tel)/i, notes: /note|comment/i, stage: /stage|status/i,
  lead_source: /source/i, source_type: /source.?type/i,
};
export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  for (const f of ['source_type', ...IMPORT_FIELDS] as ImportField[]) {
    if (m[f] !== undefined) continue;
    const i = headers.findIndex((h, idx) => GUESS[f].test(h.trim()) && !Object.values(m).includes(idx));
    if (i >= 0) m[f] = i;
  }
  return m;
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;.]{2,}$/;
const STAGES = new Set(['new lead','active buyer','active seller','past client','sphere','nurture','cold lead','do not contact']);
const SOURCE_TYPES = new Set(['personal','firm_provided','portal','unknown']);

export type RowResult = { ok: true; row: Record<string, string> } | { ok: false; reason: string; raw: string[] };

export function validateRow(raw: string[], mapping: Mapping): RowResult {
  const get = (f: ImportField) => { const i = mapping[f]; return i === undefined ? '' : (raw[i] ?? '').trim(); };
  const first = get('first_name'); const last = get('last_name'); const email = get('email'); const phone = get('phone');
  if (!first && !last) return { ok: false, reason: 'No name', raw };
  if (!email && !phone) return { ok: false, reason: 'No email or phone', raw };
  if (email && !EMAIL_RE.test(email)) return { ok: false, reason: 'Email looks wrong', raw };
  if (phone && phone.replace(/\D/g, '').length < 10) return { ok: false, reason: 'Phone looks too short', raw };
  if (first.length > 100 || last.length > 100 || email.length > 320 || phone.length > 40) return { ok: false, reason: 'A value is too long', raw };
  if (raw.some((c) => containsSensitive(c))) return { ok: false, reason: 'Holds an account, card, routing, Social Security or license number, a password or wire details. Remove it and import again.', raw };
  if (raw.some((c) => mentionsHealthOrLegal(c))) return { ok: false, reason: 'Mentions health or a legal matter (an illness, treatment, custody, a lawsuit or bankruptcy). The CRM never stores these. Remove it and import again.', raw };
  const notes = get('notes').slice(0, 280);
  if (mentionsProtectedTrait(notes) || looksLikeInstructions(notes)) return { ok: false, reason: 'The note describes who someone is or reads like instructions. Edit the note and import again.', raw };
  const stage = get('stage').toLowerCase();
  const st = get('source_type').toLowerCase().replace(/[\s-]+/g, '_');
  return { ok: true, row: {
    display_name: [first, last].filter(Boolean).join(' '), first_name: first || last, last_name: first ? last : '',
    email, phone, notes, stage: STAGES.has(stage) ? stage : 'sphere',
    lead_source: get('lead_source').slice(0, 200) || 'CSV import', source_type: SOURCE_TYPES.has(st) ? st : 'unknown',
  } };
}

export function splitRows(rows: string[][], mapping: Mapping) {
  const good: Record<string, string>[] = [];
  const bad: { line: number; reason: string; raw: string[] }[] = [];
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    const line = i + 2;
    const r = validateRow(raw, mapping);
    if (!r.ok) { bad.push({ line, reason: r.reason, raw }); return; }
    const key = (r.row.email || r.row.phone.replace(/\D/g, '')).toLowerCase();
    if (seen.has(key)) { bad.push({ line, reason: 'Same email or phone as an earlier row', raw }); return; }
    seen.add(key);
    good.push(r.row);
  });
  return { good, bad };
}

// Good rows as contract files, so the same checker and importer handle them.
export function rowsToContractFiles(good: Record<string, string>[], filename: string) {
  const households: Record<string, unknown>[] = []; const people: Record<string, unknown>[] = []; const methods: Record<string, unknown>[] = [];
  good.forEach((r, i) => {
    const h = `csv-${i + 1}`;
    households.push({ household_id: h, display_name: r.display_name, stage: r.stage, lead_source: r.lead_source, source_type: r.source_type, summary: r.notes || '' });
    people.push({ person_id: `${h}-p`, household_id: h, first_name: r.first_name, last_name: r.last_name });
    if (r.email) methods.push({ household_id: h, person_id: `${h}-p`, kind: 'email', value: r.email });
    if (r.phone) methods.push({ household_id: h, person_id: `${h}-p`, kind: 'phone', value: r.phone });
  });
  return {
    manifest: JSON.stringify({ contract_version: CONTRACT_VERSION, created_at: new Date().toISOString(), created_by: 'csv import', notes: filename.slice(0, 200) }),
    files: {
      households: toCsv(['household_id','display_name','stage','lead_source','source_type','summary'], households),
      people: toCsv(['person_id','household_id','first_name','last_name'], people),
      contact_methods: toCsv(['household_id','person_id','kind','value'], methods),
    } as Record<string, string | null>,
  };
}

export function errorFile(headers: string[], bad: { line: number; reason: string; raw: string[] }[]): string {
  const rows = bad.map((b) => {
    const row: Record<string, unknown> = { line: b.line, problem: b.reason };
    headers.forEach((h, i) => { row[h] = b.raw[i] ?? ''; });
    return row;
  });
  return toCsv(['line', 'problem', ...headers], rows);
}
