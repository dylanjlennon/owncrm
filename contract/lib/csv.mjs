// @ts-check
// CSV reading and writing shared by the contract checker, the rescue tools and the app.

const PHONE_LIKE = /^\+?[\d\s().-]{7,20}$/;

/**
 * A cell starting with = + - @ tab or CR can run as a formula in a spreadsheet. Add an
 * apostrophe so it stays text. Phone numbers like +1 828 555 0100 are left intact.
 * @param {unknown} value
 */
export function neutralizeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s === '') return '';
  const first = s.replace(/^[\s ​﻿]+/, '')[0] ?? s[0];
  const risky = /^[=+\-@\t\r]/.test(s) || /[=+\-@]/.test(first);
  if (!risky) return s;
  if (s.startsWith('+') && PHONE_LIKE.test(s) && !/\+.*\+/.test(s)) return s;
  return `'${s}`;
}

/** @param {unknown} value */
export function csvCell(value) {
  const s = neutralizeCell(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {string[]} headers @param {Record<string, unknown>[]} rows */
export function toCsv(headers, rows) {
  const out = [headers.map(csvCell).join(',')];
  for (const r of rows) out.push(headers.map((h) => csvCell(r[h])).join(','));
  return out.join('\r\n') + '\r\n';
}

/** @param {string} text @returns {string[][]} */
export function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}
