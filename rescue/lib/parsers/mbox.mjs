// @ts-check
// Reads an mbox file (Google Takeout "Mail", Thunderbird, Apple Mail export). Read only.
import { readFileSync } from 'node:fs';
import { handleFrom, toRecord } from '../util.mjs';

/** @param {string} raw */
function decodeQP(raw) { return raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))); }

/** @param {string} path @param {{ source?: string, me: string[] }} opts */
export function parseMbox(path, opts) {
  const text = readFileSync(path, 'utf8');
  const messages = text.split(/^From [^\n]*\n/m).filter((m) => m.trim());
  const out = [];
  for (const msg of messages) {
    const split = msg.search(/\r?\n\r?\n/);
    const head = split >= 0 ? msg.slice(0, split) : msg;
    let body = split >= 0 ? msg.slice(split).trim() : '';
    /** @type {Record<string, string>} */
    const h = {};
    for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) h[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
    }
    if (/quoted-printable/i.test(h['content-transfer-encoding'] ?? '')) body = decodeQP(body);
    body = body.replace(/^--.*$/gm, '').replace(/^Content-[^\n]*$/gim, '').replace(/<[^>]+>/g, ' ');
    const from = handleFrom(h.from ?? '');
    const fromMe = !!from && opts.me.includes(from.value);
    const others = fromMe ? [h.to, h.cc].filter(Boolean).join(',').split(',').map((x) => handleFrom(x)).filter((x) => x && !opts.me.includes(x.value)) : [from];
    const nameMatch = (fromMe ? h.to : h.from)?.match(/^\s*"?([^"<]+?)"?\s*</);
    const date = h.date ? new Date(h.date) : null;
    for (const who of others) {
      out.push(toRecord({ source: opts.source ?? 'gmail', evidence_type: 'email_metadata', id: `${h['message-id'] ?? h.date ?? ''}:${who?.value}`,
        at: date && !isNaN(date.getTime()) ? date.toISOString() : null, handles: [who], name: nameMatch ? nameMatch[1].trim() : null,
        direction: fromMe ? 'out' : 'in', subject: h.subject ?? null, body }));
    }
  }
  return out;
}
