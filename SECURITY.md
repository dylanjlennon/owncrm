# Security

## Report a problem
Open a private security advisory on the GitHub repository ("Security", "Report a vulnerability"). Don't open a public issue for security problems. There is no response promise; reports are handled on a best-effort basis.

## What protects your data
- **One owner, two factors, enforced by the database.** Every table checks that the caller is the listed owner with a second factor. A stolen password alone reads nothing. Ending all sessions ("wasn't me" or "Sign out everywhere") makes every old session stop working, including stolen refresh tokens.
- **A second account is refused** by the database even if public signup is left on. The self-test still flags signup being on, because it should be off.
- **Nothing for logged-out visitors.** Grants are explicit and the logged-out read test tries every table weekly.
- **Opt-outs can't be bypassed.** The database checks every outgoing email against the opt-out list, do-not-contact flags, consent for marketing, and the alert budget, whoever sends it.
- **Secrets stay on the server.** No setting starts with NEXT_PUBLIC. A build scan fails if browser code mentions a key or an email address.
- **Public endpoints** each have their own secret or signature, a rate limit, a size limit and constant-time comparison. Signed email links do one thing each and never sign anyone in.
- **Headers:** HSTS, a strict content policy, no framing, no sniffing, no referrer, no indexing, no caching.
- **Backups** are encrypted before they leave, and checked for size and row counts.

## Threats to think about
- **Your dashboard logins** (Supabase, Vercel, GitHub, Resend) bypass everything above. Use two-factor on each. Never share them.
- **The service key** reads and writes everything. Never paste it into a chat, a screenshot or an email.
- **Wire fraud.** A client list with deal dates helps criminals time fake wiring emails. Never keep wire instructions here; the rescue tools remove them.
- **Phishing your own alerts.** Real alerts come from your sending domain and link to your CRM's address. Check before you click.
- **Prompt injection.** Text in emails can try to give your AI orders. The rescue tools mark it as untrusted and refuse summaries that read like instructions, but read what your AI writes before you approve.
- **Updates.** Nobody updates this for you. Next.js had a critical flaw in December 2025 that needed every site owner to act. Do the monthly check-up.
- **The other person's privacy.** People in your threads didn't agree to AI processing. Keep the rescue to business relationships.

## Known limits
- The scheduler and alerts depend on Vercel, Supabase and Resend. The outside watchdog catches silence, not slowness.
- Email "Delivered" depends on the provider's webhook.
- The Realtor.com and Google Voice readers were built from samples and public descriptions.
