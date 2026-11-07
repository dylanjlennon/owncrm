# Rescue tools

Plain programs that run on your computer and need no AI. Follow `prompts/RESCUE.md`.

`node rescue/bin/rescue.mjs <command> --work <folder>`

| Command | What it does |
|---|---|
| init | Makes the work folder, `config.json` (your own addresses, date cutoff) and `blocklist.txt` |
| extract --source X --input PATH | Reads one export into local records: dates, counts, a short redacted snippet. Resumable: running it again adds only new records |
| aggregate | Groups records into people, leaves out personal and automated ones, writes redacted batch files for your AI (`for-ai/batch-001.json` and on, 100 people each; `--batch-size` to change) |
| review | Checks your AI's `judgments-001.json`, `judgments-002.json` and on (and `judgments.json`), and writes `review.csv`. Your decisions start empty. The sheet's first row explains it, and a `what_to_do` column says what each row needs. A refused judgment is listed with the field, the rule and the word |
| build | Writes the contract folder from the rows you marked yes, and checks it. People on your block list are left out even with a yes, and build names them |
| check | Checks a contract folder |
| upload --send | Sends a checked folder to your CRM for review with your history token. Without --send it is a dry run |
| heartbeat --send | Tells your CRM a scheduled run happened |
| schedule | Writes `owncrm.env` (your CRM address and history token, readable only by you) and prints a schedule line with no token in it |

Sources: `gmail_connector`, `outlook_connector`, `gmail_mbox`, `outlook_mbox`, `imessage`, `google_voice`, `phone_contacts`, `android_sms`, `crm_export`, `deal_records`, `website_lists`.

The work folder must be a real folder outside this code folder. A path with a literal `~` (PowerShell and quoted paths don't expand it) or a folder inside the code is refused, so client data can't end up in a GitHub upload.

Every command adds a line to `audit.jsonl` in the work folder. Tokens are never written there, or in any log.

`upload`, `heartbeat` and `schedule` only work with this app, or an app that implements "The history upload" in SPEC.md. Every other command works on its own.

Needs Node.js 22.13 or newer (it uses the built-in SQLite reader for iMessage). Tested only with fake files built by `rescue/test/fixtures.mjs`.
