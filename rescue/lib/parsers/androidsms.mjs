// @ts-check
// Android texts from an "SMS Backup & Restore" style XML file. Tested only with a fake file.
import { readFileSync } from 'node:fs';
import { handleFrom, toRecord } from '../util.mjs';

const attr = (/** @type {string} */ tag, /** @type {string} */ name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) ?? [])[1] ?? null;
const unq = (/** @type {string | null} */ s) => (s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#10;/g, '\n');

/** @param {string} path */
export function parseAndroidSms(path) {
  const xml = readFileSync(path, 'utf8');
  return [...xml.matchAll(/<sms\b[^>]*\/?>/g)].map((m, i) => {
    const t = m[0];
    const date = Number(attr(t, 'date'));
    return toRecord({ source: 'android_sms', evidence_type: 'text_metadata', id: `${attr(t, 'date')}:${attr(t, 'address')}:${i}`,
      at: date ? new Date(date).toISOString() : null, handles: [handleFrom(attr(t, 'address') ?? '')], name: unq(attr(t, 'contact_name')),
      direction: attr(t, 'type') === '2' ? 'out' : 'in', body: unq(attr(t, 'body')) });
  });
}
