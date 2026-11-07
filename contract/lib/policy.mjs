// @ts-check
// Shared rules for "Connect your history". The local tool and the CRM server both use
// this file, so the rules can't drift apart.
import { normalizeText } from './redact.mjs';
// Word lists also ignore accents, so "cáncer" reads as "cancer".
const plain = (/** @type {string} */ t) => normalizeText(t).normalize('NFD').replace(/\p{M}/gu, '');

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

/** @param {string | null | undefined} text */
export function mentionsProtectedTrait(text) {
  return !!text && PROTECTED_RE.test(plain(text));
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
  for (const [name, re] of Object.entries(SENSITIVE_TOPICS)) if (re.test(text)) return name;
  return REAL_ESTATE_SIGNAL.test(text) ? 'real_estate' : 'unrelated';
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
/** @param {string | null | undefined} text */
export function mentionsHealthOrLegal(text) {
  return !!text && HEALTH_LEGAL_RE.test(plain(text));
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
  String.raw`<\/?\s*(system|assistant|user|instructions?|prompt)\s*>|^\s*(system|assistant)\s*:`,
  String.raw`[A-Za-z0-9+/]{40,}={0,2}`,
];
const INSTRUCTION_RE = new RegExp(INSTRUCTION_PATTERNS.join('|'), 'im');
/** @param {string | null | undefined} text */
export function looksLikeInstructions(text) {
  return !!text && INSTRUCTION_RE.test(normalizeText(text));
}
