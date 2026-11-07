# SPEC: build your own OwnCRM

For agents building the app fresh instead of using `src/`. Your app must accept the same data folder (`/contract`, version 1.x) and pass the acceptance tests below. Read AGENTS.md first.

## Shape

- One owner login per install, email and password plus a required authenticator code. The database must refuse every read and write unless the caller is the listed owner with a second factor (`aal2` in the token), not just the screens.
- Public signup off, and the database refuses a second account even if signup is left on.
- Every table: row level security on, explicit grants, nothing for logged-out visitors. Functions with elevated rights set `search_path = ''`.
- Server-only secrets never reach the browser. Public endpoints (lead form, inbound email, delivery webhook, scheduler, backup report, history upload) each have their own secret or signature, rate limits, size limits, constant-time comparison. The form has a honeypot.
- Security headers: HSTS, CSP with nonces for scripts and styles (no inline styles), frame deny (only the public lead form may be framed, by sites the owner lists), nosniff, no-referrer, noindex, private no-store.
- Helper functions that reveal anything about the database (table names, size, the local date) or do work (cleanup, rate limits) answer only the owner with a second factor and the server.
- Emailed one-purpose links ("I replied", "wasn't me") expire within 24 hours and work once.
- Never store an AI login or an AI key.
- A time zone setting drives every due date.
- One source for every count. True totals with paging. Display stage derived from deals, or drift flagged. CSV export neutralizes formula cells without breaking phone numbers. No email prefilled on the login page. Flash messages from fixed codes only.

## Data contract

- Import only folders that pass `contract/lib/validate.mjs`, or that pass the same rules written below. The rules are written out here so an app in another language can match them. If this text and the code ever disagree, the code wins and this text is a bug.
- One-click undo per import.

### Refusal rules (the whole folder is refused, with an error file of file, line, column, problem)

1. **Shape.** Only `manifest.json` and the eight CSV files named in `contract/README.md`. Any other file is refused (a messages export must never ride along). Only the columns in `contract/schema/*.schema.json`; an unknown column is refused. Required columns must be present and filled. Enums, lengths and patterns follow the schema. `manifest.contract_version` must start with `1.`.
2. **Links.** Ids are unique within their file. Every `household_id` and `person_id` points at a row that exists. Every household has at least one row in `contact_methods.csv`. At most 20,000 households per folder.
3. **Sensitive numbers, in every text column of every file.** Refuse a value that contains any of these:
   - a line mentioning wire, wiring, routing, ABA, SWIFT, IBAN, beneficiary, or "account no / number / #";
   - "password", "passcode", "passwd", "pwd" or "pin" followed by "is", ":" or "=" and a value;
   - a Social Security number written 123-45-6789 or 123 45 6789, or "SSN" / "social security" followed by 9 digits;
   - 13 to 19 digits (spaces or dashes allowed) that pass the Luhn check (a card number);
   - "driver's license", "DL" or "license no / number / #" followed by 5 to 20 letters, digits or dashes;
   - "acct", "account" or "loan" followed by 6 to 17 digits;
   - **any standalone run of exactly 9 digits** (the shape of a Social Security or routing number), even with no keyword;
   - **any standalone run of 12 to 17 digits** (the shape of a bank or loan account).
   "Standalone" means not touching a letter, digit, dash, dot or plus on either side, so phone numbers (10 or 11 digits, or with separators), ZIP+4 codes, dates and ids are not refused.
4. **Health and legal matters, in every text column of every file.** Refuse a value that contains any of these words (case does not matter; a * means any ending): diagnos*, doctor, doctors, hospital*, surgery, surgeries, surgical, chemo*, radiation treatment, therapy, therapist, prescription*, medication*, cancer, tumor, tumour, biopsy, biopsies, clinic, symptom*, mental health, rehab, dialysis, pregnan*, miscarriage, dementia, alzheimer's, terminal ill / terminally ill, hospice; lawsuit, lawsuits, sued, suing, custody, divorc*, court date, court hearing, court order, subpoena*, bankrupt*, foreclos*, arrest*, criminal, felony, probation, parole, restraining order, eviction lawsuit. "Attorney", "lawyer" and "probate" are allowed: they are ordinary closing words.
5. **Who someone is, in judgment fields** (`households.summary`, `households.why`, `households.suggested_next_step`, `interactions.summary`). Refuse these words: race, racial, black, white, hispanic, latino, latina, asian, ethnic, ethnicity, national origin, immigrant, religion, religious, christian, jewish, muslim, hindu, church, synagogue, mosque, gay, lesbian, bisexual, transgender, queer, sexual orientation, gender identity, pregnant, pregnancy, disabled, disability, wheelchair, handicap, familial status, single mom, single dad, age, elderly, retiree, old, young, married, divorced, widow, widowed.
6. **Text that reads like instructions, in the same judgment fields.** Refuse: ignore / disregard / forget / override / bypass followed within 40 characters by instructions, rules, prompt, previous, prior, earlier, above, everything or all; "upload everything / all"; send / forward / email / upload / export / share / post / copy / leak / transfer followed by all / every / entire / whole / full and then data, contacts, clients, client list, database, records, emails, files, leads, passwords, keys or tokens; "send the client list" and the like; "new / updated / real / hidden / secret instructions"; "system prompt", "you are now", "do not tell the user / owner", "jailbreak", "developer mode"; pretend / act as if / act like followed by you; approve or mark followed by every / everyone / all; tags like `<system>` or a line starting "system:" or "assistant:"; and any run of 40 or more base64 characters. **This rule is a backstop, not a guarantee.** The real control is that the owner reads and approves every person.

### Merge rules (what the importer does with a valid folder)

The reference is `public.import_contract` in `supabase/migrations/20261106000200_views_and_functions.sql`.

1. For each household, look for an existing, non-archived, non-test contact with the same email (lowercased, trimmed) or the same phone (last 10 digits). If one matches, **merge**: keep the existing contact, its name, stage, notes and consent; only widen its first and last contact dates. If none matches, create a new contact with the folder's name, stage, source, source type, dates and summary (as notes).
2. A suggested next step becomes a follow-up, due on `suggested_next_step_on` or 7 days from today, titled with the step and its reason.
3. People are added only to new contacts. For a merged contact, the folder's people map onto its existing primary person.
4. Emails and phones are added to the matched or new contact. Exact duplicates are skipped.
5. Deals, interactions (summaries only) and source evidence are added, linked to the import so undo can remove them.
6. **Consent.** Every new contact gets a consent row. An "opted_in" claim in the folder is stored as **unknown**, with the source "Import says opted in, not confirmed". An "opted_out" claim is stored as opted out **and** every email on that contact goes on the opt-out list. A merged contact's consent is never changed, except that an opt-out is always added.
7. Every row in `suppressions.csv` goes on the opt-out list. Nothing ever removes a row from it, including undo.
8. An import creates no lead and sends no email.
9. Undo removes everything the import created, including emails, phones, deals, follow-ups, interactions and evidence it added to contacts that already existed. The existing contacts themselves, consent history and the opt-out list stay.

### The history upload (only needed if you want the rescue tool's upload, check-in and schedule commands)

`rescue upload`, `rescue heartbeat` and `rescue schedule` talk to this exact address and format. An app built from this SPEC reads the folder either way. It works with these three commands **only if** it implements this endpoint exactly. Otherwise the owner imports the folder through the Import page.

- `POST {APP_URL}/api/history/upload`, `Content-Type: application/json`, `Authorization: Bearer och_<token>`. The token is made in the app, shown once, stored only as a SHA-256 hash, revocable, expiring, scoped to `history_upload`. Wrong, revoked, expired or wrongly scoped: 401. More than 30 uploads per token per hour: 429. Body over 4 MB: 413.
- Body (anything else is refused with 400): `{"client_batch_id": "<8 to 80 of A-Z a-z 0-9 _ . : ->", "source": "<one of gmail, outlook, imessage, google_voice, phone_contacts, android_sms, crm_export, deal_records, website_lists>", "range_start": "YYYY-MM-DD" (optional), "range_end": "YYYY-MM-DD" (optional), "run": {"ok": true|false, "detail": "<text, cut to 300>"} (optional), "contract": {"manifest": "<manifest.json text>", "files": {"households": "<csv text>", ...}} (optional)}`.
- No `contract`: a heartbeat. Record the source's last run (and last success if `run.ok`) and answer `{"ok": true, "heartbeat": true}`.
- With `contract`: check it with every refusal rule above. Refused: 400 with `{"error", "errors": [first 50 problems]}`. A `client_batch_id` seen before: answer `{"ok": true, "batch": <id>, "duplicate": true}` and store nothing new. Otherwise store it as a batch **waiting for the owner's approval**, answer `{"ok": true, "batch": <id>, "households": n}`, and save nothing to contacts until the owner approves households in the app.

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
| 9 | Watchdog, Status, go-live | Stop the scheduler: outside watchdog alerts within 30 minutes, red banner shows; go-live can't finish until domain, test lead, test alert, test backup with its own outside check, signup off (re-checked at Finish) and the daily all-clear pass, and it can finish when they all do; logged-out self-test; a red check (including a stopped backup) emails the owner once per 12 hours; alerts have a daily ceiling with separate lead and system reserves; the daily all-clear (on by default) reads every check, the backup age and the watchdog; weekly fake lead that cleans up |
| 10 | Backup, restore, export | Nightly encrypted copy off the platform, checked for size and counts; restore to a blank project with matching counts; forced failure alerts; export has contacts, notes, deals, consent and opt-outs |

Plus: "Connect your history" page with one card per source and a revocable, expiring, single-purpose upload token; uploaded batches wait for owner approval; history sync staleness on Status.
