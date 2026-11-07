// @ts-check
// Shared rules for "Connect your history". The local tool and the CRM server both use
// this file, so the rules can't drift apart.
import { normalizeText, MAX_CHECK_CHARS } from './redact.mjs';
// Word lists also ignore accents, so "cáncer" reads as "cancer".
const plain = (/** @type {string} */ t) => normalizeText(t).normalize('NFD').replace(/\p{M}/gu, '');
// A value longer than MAX_CHECK_CHARS is refused by the checks that refuse (it is "too long to
// check"). The two that only label text (topic, possible instructions) read a long email body in
// pieces of that size, overlapping so a phrase split between two pieces is still seen.
const tooLong = (/** @type {string} */ t) => t.length > MAX_CHECK_CHARS;
function pieces(/** @type {string} */ t) {
  if (!tooLong(t)) return [t];
  const out = [];
  for (let i = 0; i < t.length; i += MAX_CHECK_CHARS - 200) out.push(t.slice(i, i + MAX_CHECK_CHARS));
  return out;
}

/** Sources the CRM accepts from the local tool. */
export const HISTORY_SOURCES = ['gmail','outlook','imessage','google_voice','phone_contacts','android_sms','crm_export','deal_records','website_lists'];
export const EVIDENCE_TYPES = ['email_metadata','text_metadata','call_log','voicemail_metadata','contact_card','crm_export','deal_record','website_list'];
export const SUGGESTED_STAGES = ['past client','sphere','nurture','cold lead','active buyer','active seller'];

/** The only fields a row may carry. No message bodies, by design. */
export const ROW_FIELDS = ['client_row_id','name','email','phone','first_contact_on','last_contact_on','message_count','ai_summary','suggested_stage','suggested_next_step','why','evidence_source_type'];

// Words that describe who someone is rather than what happened. Suggestions and summaries
// containing them are refused: ranking uses dates and interaction patterns only.
export const PROTECTED = [
  'race','racial','black','white','hispanic','latino','latina','asian','ethnic','ethnicity','national origin','immigrant',
  'religion','religious','christian','jewish','muslim','hindu','church','synagogue','mosque',
  'gay','lesbian','bisexual','transgender','queer','sexual orientation','gender identity',
  'pregnant','pregnancy','disabled','disability','wheelchair','handicap','familial status','single mom','single dad',
  'age','elderly','retiree','old','young','married','divorced','widow','widowed',
];
const PROTECTED_RE = new RegExp(`\\b(${PROTECTED.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');

const PROTECTED_ALL = new RegExp(PROTECTED_RE.source, 'gi');
// "Old" about a building or its parts, not a person: "old jail renovated into lofts", "old roof".
const OLD_THING_AFTER = /^\s+(?:(?:county|city|town|mill|stone|brick|textile)\s+)?(?:jail|prison|hospital|house|home|farmhouse|cabin|barn|mill|school(?:house)?|building|warehouse|factory|store|post office|station|roof|floors?|windows?|wiring|plumbing|furnace|hvac|water heater|kitchen|bath(?:room)?s?|carpet|deck|siding|growth|trees?|town|world|fixtures?|foundation|chimney|garage|shed)\b/i;

/** @param {string | null | undefined} text */
export function mentionsProtectedTrait(text) {
  if (!text) return false;
  if (tooLong(text)) return true;
  const t = plain(text);
  for (const m of t.matchAll(PROTECTED_ALL)) {
    const after = t.slice(/** @type {number} */ (m.index) + m[0].length, /** @type {number} */ (m.index) + m[0].length + 60);
    // Part of a street name ("Old Prison Camp Rd", "White Oak Dr").
    if (/^[A-Z]/.test(m[0]) && STREET_AFTER.test(after)) continue;
    if (/^old$/i.test(m[0]) && OLD_THING_AFTER.test(after)) continue;
    return true;
  }
  return false;
}

// Topics that are never summarized and keep a thread out of scope.
export const SENSITIVE_TOPICS = {
  medical: /\b(diagnos\w*|doctor|hospital|surgery|chemo\w*|therapy|therapist|prescription|medication|cancer|biopsy|clinic|symptom\w*|mental health)\b/i,
  legal: /\b(lawsuit|attorney|lawyer|custody|divorce|court date|subpoena|probate|bankruptcy|arrest\w*|criminal)\b/i,
  family: /\b(mom|dad|mother|father|sister|brother|grandma|grandpa|aunt|uncle|cousin|son|daughter|honey|babe|love you)\b/i,
};
export const REAL_ESTATE_SIGNAL = /\b(house|home|listing|showing|offer|closing|escrow|mortgage|pre-?approv\w*|inspection|appraisal|realtor|agent|buyer|seller|market|open house|under contract|due diligence|earnest|mls|property|square feet|sq ?ft|bedroom|zillow|realtor\.com|price|lot|acre\w*)\b/i;

/** @param {string} text */
export function classifyTopic(text) {
  const parts = pieces(String(text));
  for (const [name, re] of Object.entries(SENSITIVE_TOPICS)) if (parts.some((p) => re.test(p))) return name;
  return parts.some((p) => REAL_ESTATE_SIGNAL.test(p)) ? 'real_estate' : 'unrelated';
}

// Health and legal matters. The importer (contract check, spreadsheet import, history upload)
// refuses any text column that mentions them, and a refused row is not stored. Text the owner
// types into the app (notes, logged calls) and lead-form messages are not checked: the database
// does not enforce this list. Kept narrower than SENSITIVE_TOPICS.legal on purpose: "closing
// attorney", "probate sale" and "assisted living" (a property type) are ordinary real estate
// words, so they are allowed, and "died" alone is left out ("the deal died"). Text is normalized
// first (fullwidth letters, zero-width spaces), and plurals are covered. This is still a word
// list, so it misses anything phrased another way. The owner's review is the real control.
export const HEALTH_LEGAL_RE = new RegExp([
  String.raw`\b(diagnos\w*|doctor'?s?|hospital\w*|surger(?:y|ies)|surgical|chemo\w*|radiation treatments?|therap(?:y|ies)|therapists?|prescriptions?|medications?|cancers?|cancerous|tumou?rs?|biops(?:y|ies)|clinics?|symptom\w*|mental health|rehab\w*|dialysis|pregnan\w*|miscarriage\w*|dementia|alzheimer'?s|terminal(?:ly)? ill|hospice\w*)\b`,
  String.raw`\b(oncolog\w*|cardiolog\w*|strokes?|heart attacks?|icu|intensive care|hiv|diabet\w*|multiple sclerosis|parkinson'?s|autis\w*|ivf|remission|(?:clinical|major|severe|postpartum) depression|depressive|antidepressants?|depression (?:and|&) anxiety|anxiety (?:and|&) depression|memory care|nursing homes?|medical leave|sick leave|passed away|died (?:of|from))\b`,
  String.raw`\b(lawsuits?|sued|suing|custody|custodial|divorc\w*|court (?:date|hearing|order)s?|subpoena\w*|bankrupt\w*|chapter (?:7|11|13)\b(?: filing| bankruptcy)?|foreclos\w*|arrest\w*|criminal|felon\w*|misdemeanou?r\w*|probation|parole|restraining orders?|eviction lawsuits?|judgments? against|jail\w*|prison\w*|incarcerat\w*|dui|dwi|indict\w*|convict(?:ed|ion)s?|litigat\w*)\b`,
].join('|'), 'i');
// Some of those words are ordinary real estate wording in the right place. A match is let
// through only in these narrow cases (tests/sanitize.test.ts has the list that must pass, and the
// list that must still be refused):
// - part of a street name: "Prison Camp Rd", "45 Hospital Dr", "Doctors Dr". Not when a name
//   follows the street word: "Dialysis Center Dr Patel", "Surgery St Joseph" (a doctor, a saint);
// - a building, not a person: "old jail renovated into lofts", "close to Mission Hospital".
//   "Old" and "former" count only when a building word follows ("former prison converted", not
//   "former prison inmate" or "two years in the old county jail");
// - a set phrase: "a stroke of luck", "nearly gave me a heart attack" (not "nearly a heart attack");
// - a "no ..." disclosure: "no pending litigation", "no judgments against the HOA". For
//   bankruptcy only "no" counts, not "without" or "free of";
// - the property, not the owner: "foreclosure listing", "bank-owned foreclosure", "full rehab".
//   "Needs rehab" alone, "rehab costs" with no house word nearby and "foreclosure sale" are
//   refused (review round 4, L2): they are as often about a person.
// Anything else that matches is refused, as before.
const STREET_AFTER = /^(?:\s+[A-Z][a-z]+){0,2}\s+(?:Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Ln|Lane|Way|Ct|Blvd|Boulevard|Cir|Circle|Pl|Place|Pkwy|Parkway|Hwy|Highway|Trl|Trail|Loop|Ridge|Cove|Creek|Branch|Gap|Mtn)\b(?!\.?\s+[A-Z][a-z])/;
const BUILDING = /^(?:jails?|prisons?|hospitals?|clinics?|hospices?)$/i;
const BUILDING_BEFORE = [
  /\b(?:historic|converted|renovated|abandoned)\s+(?:[\w'-]+\s+)?$/i,
  /(?:^|\b)(?:[Nn]ear(?:by)?|[Cc]lose to|[Nn]ext to|[Aa]cross from|[Mm]inutes (?:to|from)|[Ww]alk(?:ing)? (?:distance )?to|[Dd]rive to)\s+(?:the\s+)?(?:[A-Z][\w.'-]*\s+){0,3}$/,
];
// "Old" or "former" before the word, and a building word after it.
const OLD_BEFORE = /\b(?:old|former)\s+(?:[\w'-]+\s+)?$/i;
const BUILDING_AFTER = /^\s+(?:buildings?|site|property|complex|campus|grounds|converted|renovated|redeveloped|restored|turned|transformed|now|lofts?|condos?|apartments?)\b/i;
const NEGATED = /^(?:litigat\w*|lawsuits?|judgments? against|bankrupt\w*|foreclos\w*|liens?)$/i;
const NEGATED_BEFORE = /\b(?:no|not any|without|free of|free from)\s+(?:(?:pending|known|current|open|outstanding|active|recorded|threatened|or)\s+){0,3}$/i;
const NEGATED_BEFORE_STRICT = /\b(?:no|not any)\s+(?:(?:pending|known|current|open|outstanding|active|recorded|threatened|or)\s+){0,3}$/i;
const FORECLOSURE_AFTER = /^\s+(?:listings?|auctions?|propert(?:y|ies)|homes?|houses?|market|inventory|deals?|lists?)\b/i;
const FORECLOSURE_BEFORE = /\b(?:bank[- ]owned|reo|pre-)\s*$/i;
const REHAB_BEFORE = /\b(?:full|complete|gut|light|heavy|total|cosmetic|major|minor|needs? an?)\s*$/i;
const REHAB_AFTER = /^\s+(?:needed|required|projects?|loans?|work|candidates?|specials?|propert(?:y|ies)|homes?|houses?|deals?|listings?)\b/i;
// "Rehab costs", "rehab budget": only with a house word near it ("kitchen rehab costs").
const REHAB_COST_AFTER = /^\s+(?:costs?|budgets?|estimates?)\b/i;
const HOUSE_WORD = /\b(?:house|home|property|kitchen|roof|bath(?:room)?s?|unit|condo|duplex|listing|flip|floors?|basement|deck|siding)\b/i;

/** True when the match at index i is one of the allowed real estate uses above. */
function allowedUse(/** @type {string} */ t, /** @type {number} */ i, /** @type {string} */ word) {
  const before = t.slice(Math.max(0, i - 60), i);
  const after = t.slice(i + word.length, i + word.length + 60);
  if (/^[A-Z]/.test(word) && STREET_AFTER.test(after)) return true;
  if (BUILDING.test(word) && BUILDING_BEFORE.some((re) => re.test(before))) return true;
  if (BUILDING.test(word) && OLD_BEFORE.test(before) && BUILDING_AFTER.test(after)) return true;
  if (/^strokes?$/i.test(word) && /^\s+of\b/i.test(after)) return true;
  if (/^heart attacks?$/i.test(word) && /\b(?:gave|give|gives|giving)\s+(?:me|him|her|us|you|them)\s+an?\s+$/i.test(before)) return true;
  if (/^bankrupt/i.test(word)) return NEGATED_BEFORE_STRICT.test(before);
  if (NEGATED.test(word) && NEGATED_BEFORE.test(before)) return true;
  if (/^foreclos/i.test(word) && (FORECLOSURE_AFTER.test(after) || FORECLOSURE_BEFORE.test(before))) return true;
  if (/^rehab$/i.test(word) && (REHAB_BEFORE.test(before) || REHAB_AFTER.test(after)
    || (REHAB_COST_AFTER.test(after) && (HOUSE_WORD.test(before) || HOUSE_WORD.test(after))))) return true;
  if (/^rehabb(?:ed|ing)$/i.test(word)) return true;
  return false;
}
const HEALTH_LEGAL_ALL = new RegExp(HEALTH_LEGAL_RE.source, 'gi');

/** @param {string | null | undefined} text */
export function mentionsHealthOrLegal(text) {
  if (!text) return false;
  if (tooLong(text)) return true;
  const t = plain(text);
  for (const m of t.matchAll(HEALTH_LEGAL_ALL)) if (!allowedUse(t, /** @type {number} */ (m.index), m[0])) return true;
  return false;
}

// Text copied from an email that tries to give orders. Refused in summaries.
// This is defense in depth only. A regex can't catch every way of phrasing an order
// (other languages, odd spelling, text split over lines). The real controls are structural:
// message text is labelled untrusted, the AI can't approve anyone, unknown keys are dropped,
// and the owner reads and approves every person before anything is saved.
const INSTRUCTION_PATTERNS = [
  String.raw`\b(ignore|disregard|forget|override|bypass)\b[^\n]{0,40}\b(instructions?|rules?|prompt|previous|prior|earlier|above|everything|all)\b`,
  String.raw`\b(ignore|disregard|forget)\s+(that|this|the above|what i said)\b`,
  String.raw`\bupload (everything|all)\b`,
  String.raw`\b(send|forward|email|e-mail|upload|export|share|post|copy|leak|transfer)\b[^.\n]{0,30}\b(all|every|entire|whole|full)\b[^.\n]{0,20}\b(data|contacts?|clients?|client list|database|records|emails|files|leads|passwords?|keys?|tokens?)\b`,
  String.raw`\b(send|forward|email|upload|export|share)\b[^.\n]{0,15}\b(the|my|your)\s+(client list|contact list|database|crm|address book|contacts)\b`,
  String.raw`\b(new|updated|real|actual|hidden|secret)\s+instructions?\b`,
  String.raw`\bsystem prompt\b|\byou are now\b|\bdo not tell the (user|owner)\b|\bjailbreak\b|\bdeveloper mode\b`,
  String.raw`\b(pretend|act as if|act like|behave as if)\b[^.\n]{0,20}\b(you|you're|you are|to be)\b`,
  String.raw`\b(approve|mark)\b[^.\n]{0,20}\b(every|everyone|all)\b[^.\n]{0,20}\b(candidates?|people|contacts|rows|approved)\b|\bapprove every(one|body)?\b`,
  String.raw`<\/?[ \t]{0,3}(system|assistant|user|instructions?|prompt)[ \t]{0,3}>|^[ \t]{0,20}(system|assistant)[ \t]{0,3}:`,
  String.raw`[A-Za-z0-9+/]{40,}={0,2}`,
];
const INSTRUCTION_RE = new RegExp(INSTRUCTION_PATTERNS.join('|'), 'im');
/** @param {string | null | undefined} text */
export function looksLikeInstructions(text) {
  if (!text) return false;
  return pieces(String(text)).some((p) => INSTRUCTION_RE.test(normalizeText(p)));
}
