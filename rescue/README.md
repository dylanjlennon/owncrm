# Rescue tools

Plain programs that run on your computer and need no AI. Follow `prompts/RESCUE.md`.

`node rescue/bin/rescue.mjs <command> --work <folder>`

| Command | What it does |
|---|---|
| init | Makes the work folder, `config.json` (your own addresses, date cutoff) and `blocklist.txt` |
| extract --source X --input PATH | Reads one export into local records: dates, counts, a short redacted snippet. Resumable: running it again adds only new records |
| aggregate | Groups records into people, leaves out personal and automated ones, writes a redacted file for your AI |
| review | Checks your AI's `judgments.json` and writes `review.csv`. Your decisions start empty |
| build | Writes the contract folder from the rows you marked yes, and checks it |
| check | Checks a contract folder |
| upload --send | Sends a checked folder to your CRM for review with your history token. Without --send it is a dry run |
| heartbeat --send | Tells your CRM a scheduled run happened |
| schedule | Prints a schedule line for your computer |

Sources: `gmail_connector`, `outlook_connector`, `gmail_mbox`, `outlook_mbox`, `imessage`, `google_voice`, `phone_contacts`, `android_sms`, `crm_export`, `deal_records`, `website_lists`.

Every command adds a line to `audit.jsonl` in the work folder. Tokens are never written there.

Needs Node.js 22.13 or newer (it uses the built-in SQLite reader for iMessage). Tested only with fake files built by `rescue/test/fixtures.mjs`.
