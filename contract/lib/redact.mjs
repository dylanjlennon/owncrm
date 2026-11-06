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

/** @type {{ name: string, re: RegExp, test?: (m: string) => boolean }[]} */
const RULES = [
  { name: 'wire instructions', re: /[^\n]*\b(wire|wiring|routing|aba|swift|iban|beneficiary|account\s*(?:no|number|#))\b[^\n]*/gi },
  { name: 'password', re: /\b(password|passcode|passwd|pwd|pin)\b\s*(?:is\s*:?|:|=)\s*\S+/gi },
  { name: 'SSN', re: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g },
  { name: 'SSN', re: /\b(?:ssn|social security(?: number| no\.?)?)\s*(?:is|:|#)?\s*\d{9}\b/gi },
  { name: 'card number', re: /\b(?:\d[ -]?){13,19}\b/g, test: (m) => luhn(m.replace(/\D/g, '')) },
  { name: 'license number', re: /\b(?:driver'?s?\s+licen[sc]e|DL|license\s*(?:no|number|#))\s*(?:is|:|#)?\s*[A-Z0-9-]{5,20}\b/gi },
  { name: 'account number', re: /\b(?:acct|account|loan)\s*(?:no|number|#)?\s*(?:is|:)?\s*\d{6,17}\b/gi },
];

/**
 * @param {string | null | undefined} text
 * @returns {{ text: string, hits: string[] }}
 */
export function redact(text) {
  if (!text) return { text: '', hits: [] };
  let out = String(text);
  /** @type {string[]} */
  const hits = [];
  for (const rule of RULES) {
    out = out.replace(rule.re, (m) => {
      if (rule.test && !rule.test(m)) return m;
      hits.push(rule.name);
      return '[REDACTED]';
    });
  }
  return { text: out, hits };
}

/** True if text still holds something that must never leave the computer. */
export function containsSensitive(/** @type {string | null | undefined} */ text) {
  if (!text) return false;
  return redact(text).hits.length > 0;
}
