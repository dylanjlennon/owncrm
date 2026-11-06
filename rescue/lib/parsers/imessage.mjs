// @ts-check
// Mac only. Copies ~/Library/Messages/chat.db to the work folder and reads the copy, read only.
// The original is never opened. Only what is on this Mac is visible; deleted messages are gone.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { handleFrom, toRecord } from '../util.mjs';

const APPLE_EPOCH = Date.UTC(2001, 0, 1);

/** @param {number | bigint | null} v */
export function appleDate(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'bigint' ? Number(v / 1000n) * 1000 : Number(v);
  const ms = n > 1e12 ? n / 1e6 : n * 1000;
  return new Date(APPLE_EPOCH + ms).toISOString();
}

/** @param {string} original @param {{ tmpDir: string }} opts */
export async function parseIMessage(original, opts) {
  if (!existsSync(original)) throw new Error(`Not found: ${original}. On a Mac, grant Full Disk Access to your terminal app first.`);
  const copy = join(opts.tmpDir, 'chat-copy.db');
  copyFileSync(original, copy);
  for (const ext of ['-wal', '-shm']) if (existsSync(original + ext)) copyFileSync(original + ext, copy + ext);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(copy, { readOnly: true });
  const stmt = db.prepare(`select m.ROWID as rowid, m.guid as guid, m.text as text, m.date as date, m.is_from_me as from_me, h.id as handle
    from message m left join handle h on h.ROWID = m.handle_id`);
  stmt.setReadBigInts(true); // Apple stores nanoseconds, too big for a plain number
  const rows = stmt.all();
  db.close();
  return rows.map((r) => toRecord({ source: 'imessage', evidence_type: 'text_metadata', id: String(r.guid ?? r.rowid),
    at: appleDate(/** @type {any} */ (r.date)), handles: [handleFrom(String(r.handle ?? ''))], direction: r.from_me ? 'out' : 'in',
    body: r.text == null ? null : String(r.text) }));
}
