// @ts-check
// Local redaction. Runs on the owner's computer before any AI step and before upload.
// The CRM server runs the same check and refuses anything that still matches.

function luhn(/** @type {string} */ digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Text is normalized before any rule runs: NFKC turns fullwidth and other look-alike digits and
 * letters into plain ones, and invisible format characters (zero-width spaces, soft hyphens,
 * direction marks) are removed. Otherwise "１２３４５６７８９" or "123<zero-width space>456789"
 * would get past every rule.
 * @param {string} text
 */
export function normalizeText(text) {
  return String(text).normalize('NFKC').replace(/\p{Cf}/gu, '');
}

// A digit run's edges: not touching another digit, and not part of a decimal ("021000021.5") or a
// "+" phone prefix. Letters, "_" and "-" next to the digits do not hide them ("ssn123456789",
// "_021000021", "acct-123456789012").
const START = String.raw`(?<![\d.+]|\d[-.\s])`;
const END = String.raw`(?!\d|[-.\s]\d)`;

/** @type {{ name: string, re: RegExp, test?: (m: string) => boolean }[]} */
const RULES = [
  { name: 'wire instructions', re: /[^\n]*\b(wire|wiring|routing|aba|swift|iban|beneficiary|account\s*(?:no|number|#))\b[^\n]*/gi },
  { name: 'password', re: /\b(password|passcode|passwd|pwd|pin)\b\s*(?:is\s*:?|:|=)\s*\S+/gi },
  // SSN shapes: 123-45-6789, 123.45.6789, 123 45 6789, 123-456-789, 123 456 789, 12345 6789.
  { name: 'SSN', re: new RegExp(String.raw`${START}\d{3}[-.\s]\d{2}[-.\s]\d{4}${END}`, 'g') },
  { name: 'SSN', re: new RegExp(String.raw`${START}\d{3}([-.\s])\d{3}\1\d{3}${END}`, 'g') },
  { name: 'SSN', re: new RegExp(String.raw`${START}\d{5}[.\s]\d{4}${END}`, 'g') },
  { name: 'SSN', re: /\b(?:ssn|social security(?: number| no\.?)?)\s*(?:is|:|#)?\s*\d{9}\b/gi },
  { name: 'tax id', re: /\b(?:ein|tin|itin|tax\s*id)\b\s*(?:no\.?|number|#)?\s*[:#]?\s*\d{2}-?\d{7}(?!\d)/gi },
  { name: 'passport number', re: /\bpassport\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Z0-9]{6,9}\b/gi },
  { name: 'card number', re: /\b(?:\d[ -]?){13,19}\b/g, test: (m) => luhn(m.replace(/\D/g, '')) },
  { name: 'license number', re: /\b(?:driver'?s?\s+licen[sc]e|DL|license\s*(?:no|number|#))\s*(?:is|:|#)?\s*[A-Z0-9-]{5,20}\b/gi },
  // "acct 123456", "acct no. 0012345", "acct-123456789012", "a/c 9876543210", "loan # 1234567".
  { name: 'account number', re: /(?:\b(?:acct|account|loan)|(?<![\w/])a\/c)\s*[-_.:#]?\s*(?:no\.?|number|#)?\s*(?:is\s*)?[:#-]?\s*\d{6,17}(?!\d)/gi },
  // No keyword needed. A run of exactly 9 digits is the shape of a Social Security or bank
  // routing number. Phone numbers have 10 or 11 digits, so they are left alone.
  { name: 'SSN or routing number', re: /(?<![\d.+])\d{9}(?!\d|\.\d)/g },
  // 12 to 17 digits in a row looks like a bank or loan account. Card numbers are caught above.
  { name: 'account number', re: /(?<![\d.+])\d{12,17}(?!\d|\.\d)/g },
];

/**
 * @param {string | null | undefined} text
 * @returns {{ text: string, hits: string[] }}
 */
export function redact(text) {
  if (!text) return { text: '', hits: [] };
  // Email addresses are set aside first: digits inside one ("test-lead-1762450000000@example.com")
  // are part of the address, not an account number. Put back unchanged at the end.
  /** @type {string[]} */
  const emails = [];
  let out = normalizeText(String(text)).replace(/[^\s@<>(),;:"']+@[^\s@<>(),;:"']+\.[A-Za-z]{2,}/g, (m) => `\u0000${emails.push(m) - 1}\u0000`);
  /** @type {string[]} */
  const hits = [];
  for (const rule of RULES) {
    out = out.replace(rule.re, (m) => {
      if (rule.test && !rule.test(m)) return m;
      hits.push(rule.name);
      return '[REDACTED]';
    });
  }
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => emails[Number(i)]);
  return { text: out, hits };
}

/** True if text still holds something that must never leave the computer. */
export function containsSensitive(/** @type {string | null | undefined} */ text) {
  if (!text) return false;
  return redact(text).hits.length > 0;
}
