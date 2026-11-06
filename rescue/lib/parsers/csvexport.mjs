// @ts-check
// CSV exports: Follow Up Boss, KW Command, any spreadsheet, closed-deal records, website lists.
// Columns are matched by name. Check the result on your own export: real column names vary.
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../../contract/lib/csv.mjs';
import { handleFrom, toRecord } from '../util.mjs';

const find = (/** @type {string[]} */ headers, /** @type {RegExp} */ re) => headers.findIndex((h) => re.test(h.trim()));

/** @param {string} path @param {{ source: 'crm_export' | 'deal_records' | 'website_lists' }} opts */
export function parseCsvExport(path, opts) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const headers = rows[0] ?? [];
  const col = {
    first: find(headers, /^first( ?name)?$/i), last: find(headers, /^last( ?name)?$/i), name: find(headers, /^(full ?name|name|client( name)?|contact)$/i),
    emails: headers.map((h, i) => (/e-?mail/i.test(h) ? i : -1)).filter((i) => i >= 0),
    phones: headers.map((h, i) => (/(phone|mobile|cell)/i.test(h) ? i : -1)).filter((i) => i >= 0),
    date: find(headers, /(closing|closed|close date|signup|signed up|created|date)/i),
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
