# Security

## Report a problem
Open a private security advisory on the GitHub repository ("Security", "Report a vulnerability"). Don't open a public issue for security problems. There is no response promise; reports are handled on a best-effort basis.

## What protects your data
- **One owner, two factors, enforced by the database.** Every table checks that the caller is the listed owner with a second factor. A stolen password alone reads nothing. Ending all sessions ("wasn't me" or "Sign out everywhere") makes every old session stop working, including stolen refresh tokens.
- **A second account is refused** by the database even if public signup is left on. The self-test still flags signup being on, because it should be off.
- **Nothing for logged-out visitors.** Grants are explicit and the logged-out read test tries every table weekly.
- **Opt-outs can't be bypassed.** The database checks every outgoing email against the opt-out list, do-not-contact flags, consent for marketing, and the alert budget, whoever sends it.
- **Secrets stay on the server.** No setting starts with NEXT_PUBLIC. A build scan fails if browser code mentions a key or an email address.
- **Public endpoints** each have their own secret or signature, a rate limit, a size limit and constant-time comparison. The lead form checks each visitor address before the site-wide limit, so one address can't lock out real visitors; past the site-wide limit leads are saved and held for a list, not refused. Forwarded email is limited per sender and in total, and is always saved. Signed email links do one thing each and never sign anyone in. The "wasn't me" and "I replied" links work once and expire after 24 hours; a link with anything added to it is refused, and "used" is recorded for the signed content, not the spelling.
- **Owner-only helpers.** The database's helper functions (table list, database size, local date, cleanup, rate limiter) answer only the owner with a second factor and the server. Public signup must be off: go-live checks it again the moment you press Finish.
- **Alerts can't be used to flood you or silence you.** Alerts have a daily ceiling enforced by the database (checked under a lock, so two at once can't both slip past), one email per red check per 12 hours, one "needs review" email per 12 hours, separate reserves for lead and system alerts, a last reserve for escalations such as "backup stopped", and a paced "Many new leads" list when leads flood in. Alerts don't count against client email.
- **Imports keep no raw files.** A spreadsheet is checked before anything is saved. Refused rows are never stored, the error file holds line numbers and reasons only, and the rows that passed are cleared after the import or after a day.
- **Birthdays have no year,** enforced by the database.
- **Headers:** HSTS, a strict content policy (scripts and styles need a per-request nonce), no framing except the lead form for the sites you list in LEAD_FORM_FRAME_ANCESTORS, no sniffing, no referrer, no indexing, no caching.
- **No AI logins or keys.** The app has nowhere to store one.
- **Backups** are encrypted before they leave, and checked for size and row counts.

## Threats to think about
- **Your dashboard logins** (Supabase, Vercel, GitHub, Resend) bypass everything above. Use two-factor on each. Never share them.
- **The service key** reads and writes everything. Never paste it into a chat, a screenshot or an email.
- **Wire fraud.** A client list with deal dates helps criminals time fake wiring emails. Never keep wire instructions here; the rescue tools remove them.
- **Phishing your own alerts.** Real alerts come from your sending domain and link to your CRM's address. Check before you click.
- **Prompt injection.** Text in emails can try to give your AI orders. The rescue tools mark message text as untrusted, your AI can't approve anyone, unknown fields are dropped, and summaries that read like instructions are refused. That last check is a word pattern, and a determined message can get past it (other languages, odd spelling, text split over lines). **Your own review of every person and summary is the real control.** Never let your agent approve people for you.
- **What the cleaning misses.** Redaction catches Social Security, card, account, routing, tax id, passport (with the word "passport") and license numbers, passwords and wire details, after undoing look-alike digits and invisible characters, and the importer refuses health and legal words (plurals too). It does not catch a 10 or 11 digit account number with no keyword (that is the shape of a phone number), pre-approval letters, bank statements, tax forms, health details outside its word list (for example "MS", "sick", "died in March"), other languages, or why someone is really moving. Text you type into the app yourself, lead-form messages and forwarded emails are not checked against the word list at all. Read before you approve.
- **Your AI company sees what your AI reads.** Your export files stay on your computer, but the snippets your agent reads go to its company under your account. Turn off training on your data in your AI plan's settings. A Gmail or Outlook connector sends email to the AI company before any local cleaning.
- **Updates.** Nobody updates this for you. Next.js had a critical flaw in December 2025 that needed every site owner to act. Do the monthly check-up.
- **The other person's privacy.** People in your threads didn't agree to AI processing. Keep the rescue to business relationships.

## Known exceptions
- **One-click unsubscribe carries its token in the address.** Email programs that offer a one-click "Unsubscribe" button (RFC 8058) POST to the exact address in the email's List-Unsubscribe header, so the signed token has to be in that address, and it can land in a proxy's or host's access log. The token can only add that one email address to your opt-out list, which is the safe direction and can't be undone, so a leaked one does no harm. Every other token stays out of addresses: the history token goes in a header, and the "I replied" and "wasn't me" pages send theirs in a form body. `Referrer-Policy: no-referrer` keeps addresses from leaking to other sites.
- **The scheduled rescue's token** lives in `owncrm.env` in your rescue work folder, readable only by you (the tool refuses the file otherwise). It is never written into a crontab line, a scheduled task or a log.

## Known limits
- The scheduler and alerts depend on Vercel, Supabase and Resend. The outside watchdog catches silence, not slowness. It means "the scheduler ran"; red checks go to email, Status and the optional second check.
- During a lead flood, leads arrive in a "Many new leads" list and get no "No reply yet" reminders.
- Email "Delivered" depends on the provider's webhook.
- The Realtor.com and Google Voice readers were built from samples and public descriptions.
