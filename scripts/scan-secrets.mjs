#!/usr/bin/env node
// Fails if the repo or the browser bundle holds something it shouldn't:
// keys, tokens, private keys, the real CRM's project, or anything that looks like real client data.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Supabase project ids that must never appear, stored as hashes so this file doesn't name them.
const FORBIDDEN_IDS = new Set(['c1116d7b4668471b55946d0ef722bbe35046c47e0471726a36812bc9e25d9c9f', 'b9d1948e8e9e6e7770929a08a3ef96be452f7a7ef0c7b189f0746ddf8f59dc80']);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const SKIP = /\.(png|jpe?g|gif|woff2?|ico|pdf)$|^package-lock\.json$/;
// Lead site sending domains (src/lib/parsers/realtor.ts, PORTAL_DOMAINS) are named in code and tests
// as senders, never as clients.
const ALLOWED_EMAIL = /@(([\w-]+\.)*example\.(com|org|net)|([\w-]+\.)*(realtor|move|zillow|trulia|homes|redfin)\.com|anthropic\.com)$/i;
const RULES = [
  ['JWT or Supabase key', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Resend API key', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/],
  ['webhook secret', /whsec_[A-Za-z0-9+/=]{24,}/],
  ['history token', /och_[A-Za-z0-9_-]{30,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----|AGE-SECRET-KEY-1[0-9A-Z]{20,}/],
  ['real-looking phone number', /(?<![\d-])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?(?!555[ .-]?01\d\d)\d{3}[ .-]\d{4}(?!\d)/],
];
const problems = [];
for (const f of files) {
  if (SKIP.test(f) || !existsSync(f) || statSync(f).isDirectory()) continue;
  const text = readFileSync(f, 'utf8');
  for (const [name, re] of RULES) {
    const m = text.match(re);
    if (m && !(name === 'real-looking phone number' && /^\d{4}-\d{2}-\d{2}$|^\d{3}-\d{2}-\d{4}$/.test(m[0].trim()))) problems.push(`${f}: ${name} (${m[0].slice(0, 12)}...)`);
  }
  for (const w of text.match(/\b[a-z]{20}\b/g) ?? []) if (FORBIDDEN_IDS.has(createHash('sha256').update(w).digest('hex'))) problems.push(`${f}: a Supabase project id that must not be in the repo`);
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    if (!ALLOWED_EMAIL.test(m[0]) && !/^(git|noreply)@github\.com$/.test(m[0])) problems.push(`${f}: email address outside example.com (${m[0]})`);
  }
}
// The browser bundle: no server settings, no email addresses, no keys.
const walk = (d) => readdirSync(d).flatMap((x) => (statSync(join(d, x)).isDirectory() ? walk(join(d, x)) : [join(d, x)]));
if (existsSync('.next/static')) {
  for (const f of walk('.next/static').filter((x) => x.endsWith('.js'))) {
    const t = readFileSync(f, 'utf8');
    for (const word of ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'LINK_SIGNING_SECRET', 'CRON_SECRET', 'RESEND_API_KEY', 'supabase.co']) if (t.includes(word)) problems.push(`${f}: browser code mentions ${word}`);
    for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g)) if (!/^[\w.-]+@(next|react|vercel)\b/.test(m[0]) && /\.(com|org|net|io|us)$/i.test(m[0])) problems.push(`${f}: email address in browser code (${m[0]})`);
  }
} else problems.push('.next/static not found: run the build before the scan');
if (problems.length) { console.error(`SCAN FAILED:\n${[...new Set(problems)].join('\n')}`); process.exit(1); }
console.log(`Scan passed: ${files.length} files and the browser bundle hold no keys, tokens or client-looking data.`);
