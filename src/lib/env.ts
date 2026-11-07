import 'server-only';

// Server-only settings. Nothing here starts with NEXT_PUBLIC_, so none of it can reach a browser.
export const env = {
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseAnonKey: () => required('SUPABASE_ANON_KEY'),
  serviceKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  appUrl: () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  linkSecret: () => process.env.LINK_SIGNING_SECRET,
  leadFormKey: () => process.env.LEAD_FORM_KEY,
  cronSecret: () => process.env.CRON_SECRET,
  backupReportSecret: () => process.env.BACKUP_REPORT_SECRET,
  resendWebhookSecret: () => process.env.RESEND_WEBHOOK_SECRET,
  resendInboundSecret: () => process.env.RESEND_INBOUND_SECRET,
  healthcheckUrl: () => process.env.HEALTHCHECK_PING_URL,
  checksHealthcheckUrl: () => process.env.HEALTHCHECK_CHECKS_URL,
  demoMode: () => process.env.DEMO_MODE === 'true',
  emailAdapter: () => process.env.EMAIL_ADAPTER || (process.env.RESEND_API_KEY ? 'resend' : 'off'),
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing setting ${name}. See .env.example.`);
  return v;
}
