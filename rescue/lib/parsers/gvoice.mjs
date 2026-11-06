// @ts-check
// Google Voice from a Google Takeout export: Takeout/Voice/Calls/*.html. Texts, call logs and
// voicemail transcripts. Built from public descriptions of the format; check it on a real export.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { handleFrom, toRecord } from '../util.mjs';

const unescape = (/** @type {string} */ s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/** @param {string} dir */
export function parseGoogleVoice(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.html'));
  const out = [];
  for (const f of files) {
    const html = readFileSync(join(dir, f), 'utf8');
    const kind = (f.match(/ - (Text|Received|Placed|Missed|Voicemail) - /) ?? [])[1];
    const nameFromFile = f.split(' - ')[0];
    if (kind === 'Text') {
      for (const m of html.matchAll(/<div class="message">([\s\S]*?)<\/div>/g)) {
        const block = m[1];
        const at = (block.match(/class="dt" title="([^"]+)"/) ?? [])[1] ?? null;
        const tel = (block.match(/href="tel:([^"]+)"/) ?? [])[1] ?? '';
        const fn = unescape((block.match(/class="fn">([\s\S]*?)<\/span>/) ?? [])[1] ?? '');
        const body = unescape((block.match(/<q>([\s\S]*?)<\/q>/) ?? [])[1] ?? '');
        const me = fn === 'Me';
        out.push(toRecord({ source: 'google_voice', evidence_type: 'text_metadata', id: `${f}:${at}:${body.length}`, at: at ? new Date(at).toISOString() : null,
          handles: [me ? handleFrom((html.match(/class="participants"[\s\S]*?href="tel:([^"]+)"/) ?? [])[1] ?? '') : handleFrom(tel)],
          name: me ? nameFromFile : fn || nameFromFile, direction: me ? 'out' : 'in', body }));
      }
    } else if (kind) {
      const at = (html.match(/class="published" title="([^"]+)"/) ?? [])[1] ?? null;
      const tel = (html.match(/href="tel:([^"]+)"/) ?? [])[1] ?? '';
      const transcript = unescape((html.match(/class="full-text">([\s\S]*?)<\/span>/) ?? [])[1] ?? '');
      out.push(toRecord({ source: 'google_voice', evidence_type: kind === 'Voicemail' ? 'voicemail_metadata' : 'call_log', id: f,
        at: at ? new Date(at).toISOString() : null, handles: [handleFrom(tel)], name: nameFromFile, direction: kind === 'Placed' ? 'out' : 'in',
        body: transcript || null }));
    }
  }
  return out;
}
