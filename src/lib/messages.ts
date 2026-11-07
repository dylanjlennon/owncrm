// Flash messages come from this fixed list. The URL carries a code, never the words,
// so a crafted link can't make the app display text of an attacker's choosing.
const MESSAGES = {
  saved: { tone: 'ok', text: 'Saved.' },
  contact_added: { tone: 'ok', text: 'Contact added.' },
  contact_archived: { tone: 'ok', text: 'Contact archived. You can restore it from its page.' },
  contact_restored: { tone: 'ok', text: 'Contact restored.' },
  followup_added: { tone: 'ok', text: 'Follow-up added.' },
  followup_done: { tone: 'ok', text: 'Follow-up marked done.' },
  note_added: { tone: 'ok', text: 'Added to the timeline.' },
  deal_saved: { tone: 'ok', text: 'Deal saved.' },
  date_added: { tone: 'ok', text: 'Key date added.' },
  date_done: { tone: 'ok', text: 'Key date marked done.' },
  email_sent: { tone: 'ok', text: 'Sent. Your email provider accepted it. Delivery shows here once it reports back.' },
  email_blocked_suppressed: { tone: 'bad', text: 'Not sent. This address is on the opt-out list.' },
  email_blocked_dnc: { tone: 'bad', text: 'Not sent. This contact is marked do not contact.' },
  email_blocked_consent: { tone: 'bad', text: 'Not sent. There is no recorded consent for marketing email to this person.' },
  email_blocked_budget: { tone: 'bad', text: 'Not sent. The rest of the email allowance is held for alerts.' },
  email_blocked_paused: { tone: 'bad', text: 'Not sent. Sending is paused. Check the Status page.' },
  email_blocked_address: { tone: 'bad', text: 'Not sent. Marketing email needs your postal address in Settings.' },
  email_failed: { tone: 'bad', text: 'Not sent. The email provider refused it. See the email list for the reason.' },
  email_missing: { tone: 'bad', text: 'Add a recipient, subject and message.' },
  bad_input: { tone: 'bad', text: 'Something in that form was missing or too long. Check it and try again.' },
  review_resolved: { tone: 'ok', text: 'Marked as handled.' },
  review_lead_created: { tone: 'ok', text: 'Lead created from this email.' },
  finding_ignored: { tone: 'ok', text: 'Ignored. It stays ignored on future cleanups.' },
  finding_reopened: { tone: 'ok', text: 'Reopened.' },
  cleanup_ran: { tone: 'ok', text: 'Cleanup finished.' },
  import_uploaded: { tone: 'ok', text: 'File read. Match the columns below.' },
  import_empty: { tone: 'bad', text: 'That file had no rows we could read.' },
  import_too_big: { tone: 'bad', text: 'That file is over the 5 MB limit. Split it and try again.' },
  import_done: { tone: 'ok', text: 'Import finished. Nobody was emailed.' },
  import_undone: { tone: 'ok', text: 'Import undone.' },
  selftest_ok: { tone: 'ok', text: 'Self-test passed.' },
  selftest_fail: { tone: 'bad', text: 'Self-test failed. See the Status page.' },
  test_lead_ok: { tone: 'ok', text: 'Test lead went all the way through and was cleaned up.' },
  test_lead_fail: { tone: 'bad', text: 'Test lead failed. See the Status page.' },
  test_alert_sent: { tone: 'ok', text: 'Test alert sent. Check your email, then confirm below.' },
  test_alert_failed: { tone: 'bad', text: 'Test alert could not be sent. Check your email settings.' },
  golive_blocked: { tone: 'bad', text: 'Go-live is not finished. Every check below has to pass first.' },
  golive_done: { tone: 'ok', text: 'Go-live checks passed.' },
  token_revoked: { tone: 'ok', text: 'Token revoked. It stopped working right now.' },
  source_disconnected: { tone: 'ok', text: 'Source marked disconnected. Follow the steps on its card to finish on your computer.' },
  batch_saved: { tone: 'ok', text: 'Approved people saved. Nobody was emailed. Their consent is unknown.' },
  batch_rejected: { tone: 'ok', text: 'Batch rejected. Nothing was saved.' },
  batch_undone: { tone: 'ok', text: 'Batch undone.' },
  rows_updated: { tone: 'ok', text: 'Choices saved.' },
  signed_out_everywhere: { tone: 'ok', text: 'Signed out everywhere.' },
  bad_login: { tone: 'bad', text: 'That email or password did not work.' },
  bad_code: { tone: 'bad', text: 'That code did not work. Wait for a fresh code and try again.' },
  not_owner: { tone: 'bad', text: 'This login is not the owner of this install.' },
} as const;

export type MessageCode = keyof typeof MESSAGES;

export function messageFor(code: unknown): { tone: 'ok' | 'bad'; text: string } | null {
  if (typeof code !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(MESSAGES, code)) return null;
  return MESSAGES[code as MessageCode];
}

export function withMessage(path: string, code: MessageCode): string {
  return `${path}${path.includes('?') ? '&' : '?'}msg=${code}`;
}
