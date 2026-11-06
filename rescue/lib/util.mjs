// @ts-check
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from '../../contract/lib/redact.mjs';
import { classifyTopic } from '../../contract/lib/policy.mjs';
import { looksLikeInstructions } from '../../contract/lib/policy.mjs';

export const hash = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex').slice(0, 24);

/** @param {string} kind @param {string} value */
export function normalizeHandle(kind, value) {
  if (kind === 'email') return value.trim().toLowerCase();
  const d = value.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** @param {string} raw @returns {{kind: 'email'|'phone', value: string} | null} */
export function handleFrom(raw) {
  if (!raw) return null;
  const m = raw.match(/[^\s<>"',;:]+@[^\s<>"',;:]+\.[a-z]{2,}/i);
  if (m) return { kind: 'email', value: m[0].toLowerCase() };
  const d = raw.replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 15) return { kind: 'phone', value: d.length === 11 && d.startsWith('1') ? `+${d}` : d.length === 10 ? `+1${d}` : `+${d}` };
  return null;
}

/**
 * Turns one message into a local metadata record. The body is read in memory to classify the
 * topic, then dropped. Only a short redacted snippet is kept, and none at all for sensitive topics.
 * @param {{ source: string, evidence_type: string, id: string, at: string | null, handles: ({kind:string,value:string}|null)[], name?: string | null, direction?: string, subject?: string | null, body?: string | null }} m
 */
export function toRecord(m) {
  const text = `${m.subject ?? ''}\n${m.body ?? ''}`;
  const topic = m.body || m.subject ? classifyTopic(text) : 'none';
  const sensitive = ['medical', 'legal', 'family'].includes(topic);
  const snippet = sensitive || !m.body ? null : redact(m.body.replace(/\s+/g, ' ').slice(0, 300)).text.slice(0, 160);
  return {
    id: hash(`${m.source}:${m.id}`), source: m.source, evidence_type: m.evidence_type, at: m.at,
    handles: m.handles.filter(Boolean), name: m.name ? String(m.name).slice(0, 120) : null, direction: m.direction ?? 'unknown',
    subject: m.subject && !sensitive ? redact(m.subject).text.slice(0, 120) : null, snippet, topic,
    possible_instructions: looksLikeInstructions(text),
  };
}

/** @param {string} work */
export function ensureWork(work) {
  for (const d of ['', 'raw', 'tmp', 'for-ai']) mkdirSync(join(work, d), { recursive: true });
}

/** @param {string} work @param {string} command @param {Record<string, unknown>} detail */
export function audit(work, command, detail) {
  appendFileSync(join(work, 'audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), command, ...detail }) + '\n');
}

/** @param {string} work */
export function loadConfig(work) {
  const p = join(work, 'config.json');
  const cfg = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  const blockPath = join(work, 'blocklist.txt');
  const block = existsSync(blockPath) ? readFileSync(blockPath, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')) : [];
  return { me: (cfg.me ?? []).map((/** @type {string} */ x) => x.toLowerCase()), blocklist: block, since: cfg.since ?? null, until: cfg.until ?? null };
}

/** @param {string | null} at @param {string | null} since @param {string | null} until */
export function inRange(at, since, until) {
  if (!at) return true;
  const d = at.slice(0, 10);
  return (!since || d >= since) && (!until || d <= until);
}
