// Small helpers for tests that talk to a real Supabase project over HTTPS. Test use only.
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function loadEnv(file = '.env.local') {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

function base32(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totp(secret, now = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

export async function api(url, anon, path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${url}${path}`, {
    method, headers: { apikey: anon, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

export async function passwordLogin(url, anon, email, password) {
  const r = await api(url, anon, '/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (r.status !== 200) throw new Error(`login failed ${r.status}`);
  return r.data;
}

// Logs the test owner in with password and the authenticator code. Enrolls TOTP the first time
// and keeps the test secret in .e2e/totp.json (git ignored).
export async function ownerAal2(url, anon, accounts, totpFile = '.e2e/totp.json') {
  const s1 = await passwordLogin(url, anon, accounts.owner_email, accounts.owner_password);
  let saved = existsSync(totpFile) ? JSON.parse(readFileSync(totpFile, 'utf8')) : null;
  if (!saved) {
    const f = await api(url, anon, '/auth/v1/factors', { method: 'POST', token: s1.access_token, body: { factor_type: 'totp', friendly_name: `e2e ${Date.now()}` } });
    if (f.status !== 200) throw new Error(`enroll failed ${f.status} ${JSON.stringify(f.data).slice(0, 200)}`);
    saved = { factorId: f.data.id, secret: f.data.totp.secret };
    writeFileSync(totpFile, JSON.stringify(saved), { mode: 0o600 });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const ch = await api(url, anon, `/auth/v1/factors/${saved.factorId}/challenge`, { method: 'POST', token: s1.access_token, body: {} });
    const v = await api(url, anon, `/auth/v1/factors/${saved.factorId}/verify`, { method: 'POST', token: s1.access_token, body: { challenge_id: ch.data.id, code: totp(saved.secret) } });
    if (v.status === 200) return { aal1: s1, aal2: v.data, totpSecret: saved.secret };
    await new Promise((r) => setTimeout(r, 31000));
  }
  throw new Error('TOTP verify failed');
}
