// @ts-check
// The contract checker. RESCUE output must pass this before anything is imported.
// The app runs the same code on every import, so the two can't disagree.
import { SCHEMAS } from './schemas.mjs';
import { parseCsv, toCsv } from './csv.mjs';
import { containsSensitive } from './redact.mjs';
import { mentionsProtectedTrait, looksLikeInstructions, mentionsHealthOrLegal } from './policy.mjs';

export const CONTRACT_VERSION = '1.0.0';
export const CSV_FILES = ['households', 'people', 'contact_methods', 'deals', 'interactions', 'consent', 'suppressions', 'source_evidence'];
const REQUIRED = ['households', 'people', 'contact_methods'];
const JUDGMENT_FIELDS = new Set(['summary', 'why', 'suggested_next_step']);
export const MAX_HOUSEHOLDS = 20000;

/** @typedef {{ file: string, line: number | string, column: string, problem: string }} ContractError */

// Error files are stored, so they must never repeat a refused value. Column and field names come
// from the file too; one that holds a number or health text is shown as "(hidden)".
const label = (/** @type {string} */ s) => (containsSensitive(s) || mentionsHealthOrLegal(s) ? '(hidden)' : String(s).slice(0, 60));

/**
 * @param {any} schema @param {Record<string, any>} row @param {(col: string, problem: string) => void} err
 */
function checkRow(schema, row, err) {
  for (const req of schema.required) if (row[req] === null || row[req] === undefined || row[req] === '') err(req, 'This column is required');
  for (const [col, rule] of Object.entries(schema.properties)) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (types.includes('array')) {
      if (!Array.isArray(v)) { err(col, 'Must be a list'); continue; }
      if (rule.maxItems && v.length > rule.maxItems) err(col, `At most ${rule.maxItems} items`);
      for (const item of v) if (rule.items?.enum && !rule.items.enum.includes(item)) err(col, 'Unknown value in this list');
      continue;
    }
    if (typeof v !== 'string') { err(col, 'Must be text'); continue; }
    if (rule.enum && !rule.enum.includes(v)) err(col, `Must be one of: ${rule.enum.join(', ')}`);
    if (rule.maxLength && v.length > rule.maxLength) err(col, `Longer than ${rule.maxLength} characters`);
    if (rule.minLength && v.length < rule.minLength) err(col, `Shorter than ${rule.minLength} characters`);
    if (rule.pattern && !new RegExp(rule.pattern).test(v)) err(col, 'Wrong format');
  }
}

/**
 * Validates a contract given as raw file text.
 * @param {{ manifest: string | null, files: Record<string, string | null | undefined>, extraFiles?: string[] }} input
 */
export function validateContract(input) {
  /** @type {ContractError[]} */
  const errors = [];
  const push = (/** @type {string} */ file, /** @type {number|string} */ line, /** @type {string} */ column, /** @type {string} */ problem) => {
    if (errors.length < 5000) errors.push({ file, line, column, problem });
  };
  for (const f of input.extraFiles ?? []) push(label(f), '', '', 'This file is not part of the contract. Message exports and raw files stay on your computer.');

  /** @type {any} */
  let manifest = null;
  if (!input.manifest) push('manifest.json', '', '', 'Missing. Copy contract/templates/manifest.json.');
  else {
    try { manifest = JSON.parse(input.manifest); } catch { push('manifest.json', '', '', 'Not valid JSON'); }
    if (manifest) {
      const extra = Object.keys(manifest).filter((k) => !(k in SCHEMAS.manifest.properties));
      if (extra.length) push('manifest.json', '', extra.map(label).join(' '), 'Unknown fields');
      checkRow(SCHEMAS.manifest, manifest, (c, p) => push('manifest.json', '', c, p));
      // Free text in the manifest (notes, created_by) is stored with the batch, so it gets the
      // same checks as every CSV column.
      for (const [k, v] of Object.entries(manifest)) {
        if (typeof v !== 'string') continue;
        if (containsSensitive(v)) push('manifest.json', '', label(k), 'Looks like a Social Security, card, account, routing, license number, password or wire details. Remove it.');
        if (mentionsHealthOrLegal(v)) push('manifest.json', '', label(k), 'Mentions health or a legal matter. Remove it.');
        if (looksLikeInstructions(v)) push('manifest.json', '', label(k), 'Reads like instructions copied from a message. Remove it.');
      }
      if (typeof manifest.contract_version === 'string' && manifest.contract_version.split('.')[0] !== CONTRACT_VERSION.split('.')[0]) {
        push('manifest.json', '', 'contract_version', `This app reads contract version ${CONTRACT_VERSION.split('.')[0]}.x`);
      }
    }
  }

  /** @type {Record<string, Record<string, any>[]>} */
  const data = {};
  for (const name of CSV_FILES) {
    const file = `${name}.csv`;
    const text = input.files[name];
    data[name] = [];
    if (text === null || text === undefined) {
      if (REQUIRED.includes(name)) push(file, '', '', 'Missing. Copy it from contract/templates.');
      continue;
    }
    const schema = SCHEMAS[/** @type {keyof typeof SCHEMAS} */ (name)];
    const rows = parseCsv(text);
    if (!rows.length) { push(file, 1, '', 'No header row'); continue; }
    const header = rows[0].map((h) => h.trim());
    const known = Object.keys(schema.properties);
    for (const h of header) if (!known.includes(h)) push(file, 1, label(h), 'Unknown column. Only contract columns are allowed, so message text can\'t ride along.');
    for (const r of schema.required) if (!header.includes(r)) push(file, 1, r, 'Required column is missing');
    rows.slice(1).forEach((cells, i) => {
      const line = i + 2;
      if (cells.length > header.length) push(file, line, '', 'More cells than columns');
      /** @type {Record<string, any>} */
      const row = {};
      header.forEach((h, idx) => { const v = (cells[idx] ?? '').trim(); row[h] = v === '' ? null : v.replace(/^'(?=[=+\-@])/, ''); });
      checkRow(schema, row, (c, p) => push(file, line, c, p));
      for (const [col, v] of Object.entries(row)) {
        if (typeof v !== 'string') continue;
        if (containsSensitive(v)) push(file, line, col, 'Looks like a Social Security, card, account, routing, license number, password or wire details. Remove it.');
        if (mentionsHealthOrLegal(v)) push(file, line, col, 'Mentions health or a legal matter (for example an illness, treatment, custody, a lawsuit or bankruptcy). The CRM never stores these. Remove it.');
        if (JUDGMENT_FIELDS.has(col) || (name === 'interactions' && col === 'summary')) {
          if (mentionsProtectedTrait(v)) push(file, line, col, 'Describes who someone is. Use dates and what happened only.');
          if (looksLikeInstructions(v)) push(file, line, col, 'Reads like instructions copied from a message. Summaries only.');
        }
      }
      data[name].push(row);
    });
  }

  // Ids and links between files.
  const ids = (/** @type {string} */ name, /** @type {string} */ col) => {
    const seen = new Set();
    data[name].forEach((r, i) => { if (r[col] && seen.has(r[col])) push(`${name}.csv`, i + 2, col, 'Duplicate id'); seen.add(r[col]); });
    return seen;
  };
  const hh = ids('households', 'household_id');
  const people = ids('people', 'person_id');
  ids('deals', 'deal_id');
  if (hh.size > MAX_HOUSEHOLDS) push('households.csv', '', '', `More than ${MAX_HOUSEHOLDS} households. Split the folder.`);
  for (const name of ['people', 'contact_methods', 'deals', 'interactions', 'consent', 'source_evidence']) {
    data[name].forEach((r, i) => {
      if (r.household_id && !hh.has(r.household_id)) push(`${name}.csv`, i + 2, 'household_id', 'No household with this id');
      if (r.person_id && !people.has(r.person_id)) push(`${name}.csv`, i + 2, 'person_id', 'No person with this id');
    });
  }
  const withContact = new Set(data.contact_methods.map((r) => r.household_id));
  data.households.forEach((r, i) => { if (r.household_id && !withContact.has(r.household_id)) push('households.csv', i + 2, 'household_id', 'Needs at least one email or phone in contact_methods.csv'); });

  const counts = Object.fromEntries(CSV_FILES.map((n) => [n, data[n].length]));
  if (errors.length) return { ok: /** @type {const} */ (false), errors, counts };
  /** @type {Record<string, any>} */
  const out = { contract_version: manifest.contract_version, manifest };
  for (const n of CSV_FILES) out[n] = data[n];
  return { ok: /** @type {const} */ (true), errors, counts, data: out };
}

/** @param {ContractError[]} errors */
export function errorsCsv(errors) {
  return toCsv(['file', 'line', 'column', 'problem'], errors);
}

/**
 * Keeps only the chosen households and everything linked to them. Opt-outs are always kept.
 * @param {Record<string, any>} data @param {Set<string>} keep
 */
export function filterContract(data, keep) {
  /** @type {Record<string, any>} */
  const out = { ...data };
  for (const n of CSV_FILES) {
    if (n === 'suppressions') continue;
    out[n] = (data[n] ?? []).filter((/** @type {any} */ r) => keep.has(r.household_id));
  }
  return out;
}
