// Parser for lead notification emails from the big portals (Realtor.com, Zillow, Homes.com,
// Trulia, Redfin), forwarded to the inbound address. They all list the lead as labelled lines
// ("Name:", "Email:", "Phone:"), so one reader handles them; the portal only sets the source.
// IMPORTANT: this matches samples written from public descriptions. Check it against a real
// email from your portal before you rely on it. If a template changes, leads go to Needs review.
export type ParsedLead = {
  first_name: string; last_name: string | null; email: string | null; phone: string | null;
  property: string | null; message: string | null; source: string; source_type: 'portal';
};
export type ParseResult = { ok: true; lead: ParsedLead } | { ok: false; reason: string };

const LABELS: Record<string, RegExp> = {
  name: /^(?:lead\s+|buyer\s+|contact\s+)?(?:full\s+)?name\s*[:\-]\s*(.+)$/im,
  first: /^first\s*name\s*[:\-]\s*(.+)$/im,
  last: /^last\s*name\s*[:\-]\s*(.+)$/im,
  email: /^(?:e-?mail(?:\s+address)?)\s*[:\-]\s*(.+)$/im,
  phone: /^(?:phone(?:\s+number)?|mobile|tel)\s*[:\-]\s*(.+)$/im,
  property: /^(?:property(?:\s+address)?|listing(?:\s+address)?|address)\s*[:\-]\s*(.+)$/im,
  message: /^(?:message|comments?)\s*[:\-]\s*(.+)$/im,
};
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// The portals we have a reader for, and how each one names itself in the sender, subject or text.
const PORTALS: { source: string; re: RegExp }[] = [
  { source: 'Realtor.com', re: /realtor\.com/ },
  { source: 'Zillow', re: /\bzillow\b/ },
  { source: 'Homes.com', re: /\bhomes\.com\b/ },
  { source: 'Trulia', re: /\btrulia\b/ },
  { source: 'Redfin', re: /\bredfin\b/ },
];

/** Which known lead source an email is from, or null. Cheap: reads the first 4,000 characters. */
export function knownLeadSource(from: string | null, subject: string | null, text: string): string | null {
  const hay = `${from ?? ''}\n${subject ?? ''}\n${text.slice(0, 4000)}`.toLowerCase();
  return PORTALS.find((p) => p.re.test(hay))?.source ?? null;
}
export function looksLikeRealtor(from: string | null, subject: string | null, text: string): boolean {
  return knownLeadSource(from, subject, text) === 'Realtor.com';
}

function grab(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 300) : null;
}

export function parsePortalLead(from: string | null, subject: string | null, rawText: string): ParseResult {
  if (!rawText || !rawText.trim()) return { ok: false, reason: 'The email had no readable text.' };
  const source = knownLeadSource(from, subject, rawText);
  if (!source) return { ok: false, reason: 'Not from a sender we have a template for.' };
  // Forwarding adds "> " at the start of each line.
  const text = rawText.replace(/^[> \t]+/gm, '');
  let first = grab(text, LABELS.first);
  let last = grab(text, LABELS.last);
  const full = grab(text, LABELS.name);
  if (!first && full) {
    const bits = full.split(' ');
    first = bits[0];
    last = bits.slice(1).join(' ') || null;
  }
  const emailRaw = grab(text, LABELS.email);
  const emailClean = emailRaw?.replace(/^<|>$/g, '').replace(/\s*\(.*\)$/, '') ?? null;
  const email = emailClean && EMAIL_RE.test(emailClean) ? emailClean : null;
  const phoneRaw = grab(text, LABELS.phone);
  const phone = phoneRaw && phoneRaw.replace(/\D/g, '').length >= 10 ? phoneRaw : null;
  if (!first) return { ok: false, reason: 'Could not find a name. The template may have changed.' };
  if (!email && !phone) return { ok: false, reason: 'Could not find an email or phone. The template may have changed.' };
  return { ok: true, lead: {
    first_name: first, last_name: last, email, phone,
    property: grab(text, LABELS.property), message: grab(text, LABELS.message),
    source, source_type: 'portal',
  } };
}
/** The original name, kept for callers and tests. Reads any known portal, not only Realtor.com. */
export const parseRealtorLead = parsePortalLead;
