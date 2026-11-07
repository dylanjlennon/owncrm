# The data contract (version 1.0.0)

The one shape both phases share. RESCUE writes a folder like this. BUILD imports it. The app checks every import with the same code (`contract/lib/validate.mjs`).

A folder has `manifest.json` and up to eight CSV files. Templates are in `templates/`, rules in `schema/` (JSON Schema).

| File | Required | What it holds |
|---|---|---|
| manifest.json | yes | `contract_version`, `created_at`, optional sources and date range |
| households.csv | yes | One row per relationship, with stage, source type, dates, a short summary, a suggested next step and why |
| people.csv | yes | People in each household |
| contact_methods.csv | yes | Emails and phones. Every household needs at least one |
| deals.csv | no | Deals from your own records |
| interactions.csv | no | Summaries only, never message text |
| consent.csv | no | Consent claims. Opt-outs are kept; opt-ins come in as unknown until you confirm |
| suppressions.csv | no | Opt-outs, always imported, never removed |
| source_evidence.csv | no | Where each relationship was found: source, dates, counts |

**Refused on purpose:** unknown files (like a messages export), unknown columns (like a body column), anything that looks like a Social Security, card, account, routing or license number (including a bare 9-digit number or a 12 to 17 digit run), a password or wire details, any mention of health or a legal matter (an illness, treatment, custody, a lawsuit, bankruptcy) in any column, summaries that describe who someone is, and summaries that read like instructions copied from a message. The full rules, and what the importer does with a valid folder (merging, consent, opt-outs, undo), are written out in plain language in [SPEC.md](../SPEC.md) under "Data contract", so an app built in another language can match them.

**What the rules can't catch:** passport numbers, pre-approval letters, bank statements, tax forms, health details phrased outside the word list, and why someone is really moving. The instruction check is a backstop that a determined message can get past. The owner reading every summary before approving it is the real control.

Check a folder: `npm run contract:check <folder>`. Problems go to `<folder>/contract-errors.csv` with file, line, column and a plain explanation.

Big folder (over 4 MB, the most one upload can carry on Vercel)? `npm run contract:sql <folder> > import.sql` prints SQL for the Supabase SQL editor that calls the same import function. Undo still works from the Import page.

Changing the contract: edit `schema/*.schema.json`, run `npm run contract:schemas`, update `templates/`, bump `contract_version` in `contract.json` and `lib/validate.mjs`, and update the importer migration. A test checks the schema files, `schemas.mjs` and the templates agree.
