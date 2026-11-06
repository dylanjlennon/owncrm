// The product name. Change it here and it changes everywhere in the app.
export const APP_NAME = 'OwnCRM';

export const NOT_TRANSACTION_FILE = 'Not your transaction file. Keep that in your firm\'s system.';
export const ZILLOW_NOTICE = 'Zillow Premier Agent buyer leads don\'t flow in directly. If Zillow is your main lead source, use a CRM on Zillow\'s approved list.';
export const PAGE_SIZE = 25;
export const SOURCE_TYPES: Record<string, string> = {
  personal: 'Personal', firm_provided: 'Firm-provided', portal: 'Portal', unknown: 'Not stated',
};
export const CONSENT_LABELS: Record<string, string> = {
  unknown: 'Unknown, no marketing', opted_in: 'Opted in', opted_out: 'Opted out',
};
export const STAGES = ['new lead','active buyer','active seller','past client','sphere','nurture','cold lead','do not contact'] as const;
