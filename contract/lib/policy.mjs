// @ts-check
// Shared rules for "Connect your history". The local tool and the CRM server both use
// this file, so the rules can't drift apart.

/** Sources the CRM accepts from the local tool. */
export const HISTORY_SOURCES = ['gmail','outlook','imessage','google_voice','phone_contacts','android_sms','crm_export','deal_records','website_lists'];
export const EVIDENCE_TYPES = ['email_metadata','text_metadata','call_log','voicemail_metadata','contact_card','crm_export','deal_record','website_list'];
export const SUGGESTED_STAGES = ['past client','sphere','nurture','cold lead','active buyer','active seller'];

/** The only fields a row may carry. No message bodies, by design. */
export const ROW_FIELDS = ['client_row_id','name','email','phone','first_contact_on','last_contact_on','message_count','ai_summary','suggested_stage','suggested_next_step','why','evidence_source_type'];

// Words that describe who someone is rather than what happened. Suggestions and summaries
// containing them are refused: ranking uses dates and interaction patterns only.
const PROTECTED = [
  'race','racial','black','white','hispanic','latino','latina','asian','ethnic','ethnicity','national origin','immigrant',
  'religion','religious','christian','jewish','muslim','hindu','church','synagogue','mosque',
  'gay','lesbian','bisexual','transgender','queer','sexual orientation','gender identity',
  'pregnant','pregnancy','disabled','disability','wheelchair','handicap','familial status','single mom','single dad',
  'age','elderly','retiree','old','young','married','divorced','widow','widowed',
];
const PROTECTED_RE = new RegExp(`\\b(${PROTECTED.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');

/** @param {string | null | undefined} text */
export function mentionsProtectedTrait(text) {
  return !!text && PROTECTED_RE.test(text);
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

// Text copied from an email that tries to give orders. Treated as data and refused in summaries.
const INSTRUCTION_RE = /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions?|rules?|prompt|previous|above)\b|\bupload (everything|all)\b|\bsystem prompt\b|\byou are now\b|\bdo not tell the (user|owner)\b/i;
/** @param {string | null | undefined} text */
export function looksLikeInstructions(text) {
  return !!text && INSTRUCTION_RE.test(text);
}
