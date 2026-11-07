// @ts-check
// CSV exports: Follow Up Boss, KW Command, any spreadsheet, closed-deal records, website lists.
// Columns are matched by name. Check the result on your own export: real column names vary.
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../../contract/lib/csv.mjs';
import { handleFrom, toRecord } from '../util.mjs';

const find = (/** @type {string[]} */ headers, /** @type {RegExp} */ re) => headers.findIndex((h) => re.test(h.trim()));
/** The first pattern, in order, that matches any column wins. */
const findFirst = (/** @type {string[]} */ headers, /** @type {RegExp[]} */ res) => {
  for (const re of res) { const i = find(headers, re); if (i >= 0) return i; }
  return -1;
};

// Which date column to read, best first. A closed-deal export often has "Contract Date" before
// "Close Date": the close date is the one that matters (anniversaries, past client), so it is
// looked for first, and a column with just "date" in it is the last resort. A CRM export's
// "Last Activity" says when you last talked, so it comes before "Created".
const CLOSE = /^(?:actual\s+)?(?:close|closing|closed)(?:\s*(?:date|on))?$|\b(?:close|closing|closed)\s*(?:date|on)\b|\bdate\s*(?:closed|of\s+closing)\b|\bclose\s+of\s+escrow\b|\bcoe\b/i;
const LAST_TOUCH = /\blast\s*(?:activity|contact(?:ed)?|touch|communication|interaction)\b/i;
const SIGNUP = /(?:signup|sign[- ]?up date|signed up|subscribed|created|added|date added)/i;
const ANY_DATE = /(closing|closed|close date|signup|signed up|created|date)/i;
export const DATE_COLUMNS = {
  deal_records: [CLOSE, ANY_DATE],
  crm_export: [LAST_TOUCH, CLOSE, SIGNUP, ANY_DATE],
  website_lists: [SIGNUP, LAST_TOUCH, ANY_DATE],
};

/** @param {string} path @param {{ source: 'crm_export' | 'deal_records' | 'website_lists' }} opts */
export function parseCsvExport(path, opts) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const headers = rows[0] ?? [];
  const col = {
    first: find(headers, /^first( ?name)?$/i), last: find(headers, /^last( ?name)?$/i), name: find(headers, /^(full ?name|name|client( name)?|contact)$/i),
    emails: headers.map((h, i) => (/e-?mail/i.test(h) ? i : -1)).filter((i) => i >= 0),
    phones: headers.map((h, i) => (/(phone|mobile|cell)/i.test(h) ? i : -1)).filter((i) => i >= 0),
    date: findFirst(headers, DATE_COLUMNS[opts.source] ?? [ANY_DATE]),
    address: find(headers, /(property|address|street)/i), side: find(headers, /^(side|type|represent)/i), stage: find(headers, /^(stage|status)$/i),
  };
  const evidence = opts.source === 'deal_records' ? 'deal_record' : opts.source === 'website_lists' ? 'website_list' : 'crm_export';
  return rows.slice(1).map((r, i) => {
    const name = col.name >= 0 ? r[col.name] : [r[col.first], r[col.last]].filter(Boolean).join(' ');
    const date = col.date >= 0 && r[col.date] ? new Date(r[col.date]) : null;
    const rec = toRecord({ source: opts.source, evidence_type: evidence, id: `${i}:${name}`, at: date && !isNaN(date.getTime()) ? date.toISOString() : null,
      handles: [...col.emails.map((c) => handleFrom(r[c] ?? '')), ...col.phones.map((c) => handleFrom(r[c] ?? ''))], name: name || null });
    return { ...rec, topic: 'real_estate', deal: opts.source === 'deal_records' ? {
      street: col.address >= 0 ? (r[col.address] ?? '').slice(0, 200) : null,
      side: col.side >= 0 && /sell|list/i.test(r[col.side] ?? '') ? 'seller' : 'buyer',
      closing_date: rec.at ? rec.at.slice(0, 10) : null } : null,
      crm_stage: col.stage >= 0 ? (r[col.stage] ?? '').toLowerCase() : null };
  });
}
