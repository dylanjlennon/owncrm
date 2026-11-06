# SPEC: build your own OwnCRM

For agents building the app fresh instead of using `src/`. Your app must accept the same data folder (`/contract`, version 1.x) and pass the acceptance tests below. Read AGENTS.md first.

## Shape

- One owner login per install, email and password plus a required authenticator code. The database must refuse every read and write unless the caller is the listed owner with a second factor (`aal2` in the token), not just the screens.
- Public signup off, and the database refuses a second account even if signup is left on.
- Every table: row level security on, explicit grants, nothing for logged-out visitors. Functions with elevated rights set `search_path = ''`.
- Server-only secrets never reach the browser. Public endpoints (lead form, inbound email, delivery webhook, scheduler, backup report, history upload) each have their own secret or signature, rate limits, size limits, constant-time comparison. The form has a honeypot.
- Security headers: HSTS, CSP, frame deny, nosniff, no-referrer, noindex, private no-store.
- A time zone setting drives every due date.
- One source for every count. True totals with paging. Display stage derived from deals, or drift flagged. CSV export neutralizes formula cells without breaking phone numbers. No email prefilled on the login page. Flash messages from fixed codes only.

## Data contract

- Import only folders that pass `contract/lib/validate.mjs` (or the same rules).
- Imported people get consent "unknown". Opt-in claims in a folder are stored as unknown until the owner confirms. Opt-outs are always kept and enforced.
- A matching email or phone merges into the existing contact. Import creates no lead alerts.
- One-click undo per import.

## Must-haves and acceptance tests

| # | Feature | Acceptance test |
|---|---|---|
| 1 | Locked single-owner login, 2FA, new-login alert | Logged out, every table returns nothing; a second signup is refused; a new device triggers an email |
| 2 | Contacts, timeline, follow-ups, Today, search | A follow-up shows on Today on its date; search by name or phone finds it |
| 3 | Web form with consent | A submission makes a contact within 60 seconds with source, time and exact consent wording |
| 4 | Forwarded lead emails, Needs review | A Realtor.com sample makes a contact; a scrambled one lands in Needs review and alerts, nothing lost |
| 5 | CSV import with preview and undo | 500 rows with 20 bad: 480 imported, error file, nobody emailed, consent unknown, one-click undo |
| 6 | New-lead and no-reply alerts | Alert within 2 minutes; second alert on schedule; signed single-purpose "I replied" link stops it without logging in |
| 7 | One-to-one email | A bounce marks the contact; an opted-out contact can't be emailed even by a direct API call (enforce in the database); marketing mail has an unsubscribe link |
| 8 | Deals with key dates | A date 2 days out is on Today and emails at the right local hour; screens say "Not your transaction file" |
| 9 | Watchdog, Status, go-live | Stop the scheduler: outside watchdog alerts within 30 minutes, red banner shows; go-live can't finish until domain, test lead, test alert and test backup pass; logged-out self-test; reserved alert budget; daily all-clear; weekly fake lead that cleans up |
| 10 | Backup, restore, export | Nightly encrypted copy off the platform, checked for size and counts; restore to a blank project with matching counts; forced failure alerts; export has contacts, notes, deals, consent and opt-outs |

Plus: "Connect your history" page with one card per source and a revocable, expiring, single-purpose upload token; uploaded batches wait for owner approval; history sync staleness on Status.
