// @ts-check
// Reads email metadata that your AI agent saved from an email connector (Gmail, Outlook) as JSON
// lines: {"id","date","from","to","cc","subject","snippet"}. No full bodies are needed.
import { readFileSync } from 'node:fs';
import { handleFrom, toRecord } from '../util.mjs';

/** @param {string} path @param {{ source?: string, me: string[] }} opts */
export function parseConnectorJsonl(path, opts) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    const from = handleFrom(String(m.from ?? ''));
    const fromMe = !!from && opts.me.includes(from.value);
    const others = fromMe ? [m.to, m.cc].flat().filter(Boolean).join(',').split(',').map((x) => handleFrom(x)).filter((x) => x && !opts.me.includes(x.value)) : [from];
    const nameMatch = String((fromMe ? m.to : m.from) ?? '').match(/^\s*"?([^"<]+?)"?\s*</);
    for (const who of others) {
      out.push(toRecord({ source: opts.source ?? 'gmail', evidence_type: 'email_metadata', id: `${m.id ?? m.date}:${who?.value}`,
        at: m.date ? new Date(m.date).toISOString() : null, handles: [who], name: nameMatch ? nameMatch[1].trim() : null,
        direction: fromMe ? 'out' : 'in', subject: m.subject ?? null, body: String(m.snippet ?? '') }));
    }
  }
  return out;
}
