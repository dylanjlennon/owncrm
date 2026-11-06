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

**Refused on purpose:** unknown files (like a messages export), unknown columns (like a body column), anything that looks like a Social Security, card, account or license number, a password or wire details, summaries that describe who someone is, and summaries that read like instructions copied from a message.

Check a folder: `npm run contract:check <folder>`. Problems go to `<folder>/contract-errors.csv` with file, line, column and a plain explanation.

Big folder? `npm run contract:sql <folder> > import.sql` prints SQL for the Supabase SQL editor that calls the same import function.

Changing the contract: edit `schema/*.schema.json`, run `npm run contract:schemas`, update `templates/`, bump `contract_version` in `contract.json` and `lib/validate.mjs`, and update the importer migration. A test checks the schema files, `schemas.mjs` and the templates agree.
