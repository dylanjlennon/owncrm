// Parser for lead notification emails from the big portals (Realtor.com, Zillow, Homes.com,
// Trulia, Redfin), forwarded to the inbound address. They all list the lead as labelled lines
// ("Name:", "Email:", "Phone:"), so one reader handles them; the portal only sets the source.
// IMPORTANT: this matches samples written from public descriptions. Check it against a real
// email from your portal before you rely on it. If a template changes, leads go to Needs review.
export type ParsedLead = {
  first_name: string; last_name: string | null; email: string | null; phone: string | null;
  property: string | null; message: string | null; source: string; source_type: 'portal';
};
import { fromAddress } from '../html-text';

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

// The portals we have a reader for, by their real sending domains. Review round 4, M1: an email
// counts as "from a known lead source" only when the address in its From header (not the display
// name) is at one of these domains or a subdomain of one ("leads@email.realtor.com"). The display
// name, subject and text are never read for this, because anyone can type "Zillow" there.
// A From header can still be forged; see SECURITY.md. Known sources still have hourly limits,
// just higher ones (INBOUND_LIMITS in src/lib/inbound.ts).
export const PORTAL_DOMAINS: { source: string; domains: string[] }[] = [
  { source: 'Realtor.com', domains: ['realtor.com', 'move.com'] },
  { source: 'Zillow', domains: ['zillow.com'] },
  { source: 'Trulia', domains: ['trulia.com'] },
  { source: 'Homes.com', domains: ['homes.com'] },
  { source: 'Redfin', domains: ['redfin.com'] },
];
// The same portals as named in the text of an email the owner forwarded by hand. Used only to
// label the lead's source and to know which reader to use, never to lift a limit.
const PORTAL_NAMES: { source: string; re: RegExp }[] = [
  { source: 'Realtor.com', re: /realtor\.com/ },
  { source: 'Zillow', re: /\bzillow\b/ },
  { source: 'Homes.com', re: /\bhomes\.com\b/ },
  { source: 'Trulia', re: /\btrulia\b/ },
  { source: 'Redfin', re: /\bredfin\b/ },
];

/** The known lead source an email is from, decided by the From address's domain only, or null. */
export function knownLeadSource(from: string | null): string | null {
  const addr = fromAddress(from);
  if (!addr) return null;
  const domain = addr.slice(addr.lastIndexOf('@') + 1);
  return PORTAL_DOMAINS.find((p) => p.domains.some((d) => domain === d || domain.endsWith(`.${d}`)))?.source ?? null;
}
/** A portal named in the subject or the first 4,000 characters of the text. Labels only. */
export function namedPortal(subject: string | null, text: string): string | null {
  const hay = `${subject ?? ''}\n${text.slice(0, 4000)}`.toLowerCase();
  return PORTAL_NAMES.find((p) => p.re.test(hay))?.source ?? null;
}
export function looksLikeRealtor(from: string | null): boolean {
  return knownLeadSource(from) === 'Realtor.com';
}

function grab(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 300) : null;
}

export function parsePortalLead(from: string | null, subject: string | null, rawText: string): ParseResult {
  if (!rawText || !rawText.trim()) return { ok: false, reason: 'The email had no readable text.' };
  // From a portal's own address, or forwarded by hand with the portal named in the text.
  const source = knownLeadSource(from) ?? namedPortal(subject, rawText);
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
