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
 * The longest value any check reads. A longer value is refused ("too long to check") instead of
 * scanned, so no field can make a check slow. 10,000 characters is far more than any cell,
 * summary or email subject needs.
 */
export const MAX_CHECK_CHARS = 10_000;

/**
 * Text is normalized before any rule runs: NFKC turns fullwidth and other look-alike digits and
 * letters into plain ones, and invisible format characters (zero-width spaces, soft hyphens,
 * direction marks) are removed. Otherwise "１２３４５６７８９" or "123<zero-width space>456789"
 * would get past every rule. Runs of spaces and tabs become one space, so padding can neither
 * hide a number from a rule nor make a rule slow. Every kind of dash (en dash, em dash, minus
 * sign, non-breaking hyphen: what Word and Excel often put in by themselves) becomes a plain
 * hyphen, and digits from other scripts (Arabic-Indic, Devanagari and so on) become 0 to 9.
 * @param {string} text
 */
export function normalizeText(text) {
  return String(text).normalize('NFKC').replace(/[\p{Cf}\u0000]/gu, '').replace(/[^\S\r\n]+/g, ' ')
    .replace(/[\p{Pd}\u2212\u2043\u2796\u2E3A\u2E3B]/gu, '-')
    .replace(/[^\x00-\x7F]/gu, (c) => (/\p{Nd}/u.test(c) ? asciiDigit(c) : c))
    // Accent or underline marks stuck on a digit ("1̲2̲3...") would split the number.
    .replace(/(\d)\p{M}+/gu, '$1');
}

// Unicode keeps each script's digits 0 to 9 in a row, so a digit's value is its distance from
// the first code point of that row.
function asciiDigit(/** @type {string} */ c) {
  const cp = /** @type {number} */ (c.codePointAt(0));
  let zero = cp;
  while (cp - zero < 9 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--;
  return String(cp - zero);
}

// A digit run's edges: not touching another digit, and not part of a decimal ("021000021.5") or a
// "+" phone prefix. Letters, "_" and "-" next to the digits do not hide them ("ssn123456789",
// "_021000021", "acct-123456789012").
const START = String.raw`(?<![\d.+]|\d[-.\s])`;
const END = String.raw`(?!\d|[-.\s]\d)`;

// Every rule below is written so it can't backtrack badly: separators are one character class
// with a small upper bound ({0,4}), never two unbounded \s* next to each other, and the rules
// that take a whole line start only at the start of a line. tests/regex-speed.test.ts times
// every rule on 10,000-character adversarial input.
const SEP = String.raw`[\s\-_.:#]{0,4}`;

/** @type {{ name: string, re: RegExp, test?: (m: string) => boolean }[]} */
const RULES = [
  { name: 'wire instructions', re: /^[^\n]*?\b(?:wire|wiring|routing|aba|swift|iban|beneficiary|account[\s#]{0,3}(?:no|number|#))\b[^\n]*/gim },
  { name: 'password', re: /\b(?:password|passcode|passwd|pwd|pin)\b\s{0,3}(?:is\s{0,3}:?|:|=)\s{0,3}\S+/gi },
  // SSN shapes: 123-45-6789, 123.45.6789, 123 45 6789, 123/45/6789, 123_45_6789, 123-456-789,
  // 123 456 789, and with a space around the dash as typed by hand: 123 - 45 - 6789, 123 -45- 6789
  // (review round 4, L3). Each separator is one character, with at most one space either side.
  { name: 'SSN', re: new RegExp(String.raw`${START}\d{3}(?: ?[-./_] ?|\s)\d{2}(?: ?[-./_] ?|\s)\d{4}${END}`, 'g') },
  { name: 'SSN', re: new RegExp(String.raw`${START}\d{3}( ?[-._] ?|\s)\d{3}\1\d{3}${END}`, 'g') },
  // With the word: "SSN 123456789", "ss# 12345 6789", "SSN: 123 456789", "social security
  // number: 123-45-6789". The 5+4 and 3+6 shapes are checked only next to the word: on their own
  // they are a zip code and a year ("NC 28801 2019 build").
  { name: 'SSN', re: new RegExp(String.raw`\b(?:ssn|ss#|social security(?: number| no\.?)?)${SEP}(?:is${SEP})?(?:\d{3}[-_.\s]?\d{2}[-_.\s]?\d{4}|\d{3}[-_.\s]\d{6}|\d{5}[-_.\s]\d{4})(?!\d)`, 'gi') },
  { name: 'tax id', re: new RegExp(String.raw`\b(?:ein|tin|itin|tax\s?id)\b${SEP}(?:(?:no\.?|number)${SEP})?\d{2}-?\d{7}(?!\d)`, 'gi') },
  { name: 'passport number', re: new RegExp(String.raw`\bpassport${SEP}(?:(?:no\.?|number)${SEP})?[A-Z0-9]{6,9}\b`, 'gi') },
  // Cards: 13 to 19 digits, in groups split by single spaces, hyphens, dots or underscores.
  { name: 'card number', re: /(?<![\d.])(?:\d[ ._-]?){12,18}\d(?!\d)/g, test: (m) => luhn(m.replace(/\D/g, '')) },
  { name: 'license number', re: new RegExp(String.raw`\b(?:driver'?s?\s{1,3}licen[sc]e|DL|license${SEP}(?:no|number|#))${SEP}(?:is${SEP})?[A-Z0-9-]{5,20}\b`, 'gi') },
  // "acct 123456", "acct no. 0012345", "acct-123456789012", "a/c 9876543210", "loan # 1234567",
  // "account number is 12345678". After "loan" a marker is needed ("loan # 1234567"): "loan
  // 300000" is a loan amount, not an account.
  // Grouped too, as printed on statements: "acct 1234-5678-9012", "account 1234 5678 9012"
  // (review round 4, L3): 6 to 17 digits in all, in groups split by single spaces or hyphens.
  { name: 'account number', re: new RegExp(String.raw`(?:\b(?:acct|account)|(?<![\w/])a\/c)${SEP}(?:(?:no\.?|nbr|num|number)${SEP})?(?:is${SEP})?(?:\d{6,17}|\d{2,8}(?:[ -]\d{2,8}){1,5})(?!\d)`, 'gi'),
    test: (m) => { const n = m.replace(/\D/g, '').length; return n >= 6 && n <= 17; } },
  { name: 'account number', re: new RegExp(String.raw`\bloan${SEP}(?:no\.?|nbr|num|number|#)${SEP}(?:is${SEP})?\d{6,17}(?!\d)`, 'gi') },
  // No keyword needed. A run of exactly 9 digits is the shape of a Social Security or bank
  // routing number. Phone numbers have 10 or 11 digits, so they are left alone.
  { name: 'SSN or routing number', re: /(?<![\d.+])\d{9}(?!\d|\.\d)/g },
  // 12 to 17 digits in a row looks like a bank or loan account. Card numbers are caught above.
  { name: 'account number', re: /(?<![\d.+])\d{12,17}(?!\d|\.\d)/g },
];

/** @param {string} local the part of an email address before "@" */
const setAside = (local) => /[A-Za-z]/.test(local) && !/(?<!\d)\d{9}(?!\d)|(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/.test(local);

/**
 * @param {string | null | undefined} text
 * @returns {{ text: string, hits: string[] }}
 */
export function redact(text) {
  if (!text) return { text: '', hits: [] };
  /** @type {string[]} */
  const hits = [];
  let input = String(text);
  if (input.length > MAX_CHECK_CHARS) { input = input.slice(0, MAX_CHECK_CHARS); hits.push('too long to check'); }
  // Email addresses are set aside first: digits inside one ("test-lead-1762450000000@example.com")
  // are part of the address, not an account number. Put back unchanged at the end. The match
  // starts only at the start of a word, so a long run with no "@" is read once, not once per
  // character. Only an address whose first part has a letter and no SSN or routing shape is set
  // aside: "123-45-6789@example.com" and "routing021000021@example.com" are numbers with "@" glued on, and
  // the rules still see them.
  /** @type {string[]} */
  const emails = [];
  let out = normalizeText(input).replace(/(?<![^\s@<>(),;:"'])[^\s@<>(),;:"']+@[^\s@<>(),;:"']+\.[A-Za-z]{2,}/g,
    (m) => (setAside(m.slice(0, m.indexOf('@'))) ? `\u0000${emails.push(m) - 1}\u0000` : m));
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
