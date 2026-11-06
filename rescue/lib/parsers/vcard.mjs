// @ts-check
// Phone or Mac contacts exported as a .vcf file. Names, emails and phones only.
import { readFileSync } from 'node:fs';
import { handleFrom, toRecord } from '../util.mjs';

/** @param {string} path */
export function parseVcf(path) {
  const text = readFileSync(path, 'utf8').replace(/\r?\n[ \t]/g, '');
  const out = [];
  for (const card of text.split(/BEGIN:VCARD/i).slice(1)) {
    const lines = card.split(/\r?\n/);
    const get = (/** @type {string} */ k) => lines.filter((l) => l.toUpperCase().startsWith(k)).map((l) => l.slice(l.indexOf(':') + 1).trim());
    const fn = get('FN')[0] ?? get('N')[0]?.split(';').reverse().join(' ').trim() ?? null;
    const handles = [...get('EMAIL'), ...get('TEL')].map(handleFrom);
    if (!handles.some(Boolean)) continue;
    out.push(toRecord({ source: 'phone_contacts', evidence_type: 'contact_card', id: `${fn}:${handles.map((h) => h?.value).join(',')}`, at: null, handles, name: fn }));
  }
  return out;
}
