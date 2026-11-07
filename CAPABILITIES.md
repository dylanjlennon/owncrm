# What OwnCRM can and can't do

**Key:** **Can** works today. **Later** is possible with time or money. **Can't** is technically closed or outside our control. **Won't** is a deliberate choice.

The same list is in the app, under "What this can and can't do". A test checks the two match.

| Item | Verdict | Plain truth |
|---|---|---|
| Contacts, notes, follow-ups and deal dates in a database you own | Can | One owner login with a second factor. Every row is locked to you by the database. |
| Website leads, forwarded lead emails and CSV files | Can | Realtor.com forwarded emails use a parser built from a sample and tested on fake files only. Other lead emails go to Needs review for you to sort. Nothing is dropped once the email reaches the app. |
| New-lead and no-reply alerts by email | Can | Email only. Make the sender a VIP on your phone so it actually gets your attention. |
| One-to-one email with opt-out enforcement | Can | Needs a domain you control. Replies land in your normal inbox, not here. |
| Backup, full export and warnings when something breaks | Can | Only if you set up the nightly backup and the outside watchdog. A backup counts once you have restored it. |
| Find relationships in your own past email and texts | Can | Your own AI agent does this under your own account. Your files stay on your computer, but what your AI reads goes to your AI company. Only summaries and dates come here, for people you approve. Tested on fake files only. |
| iMessage history | Can | Mac only, from a read-only copy, after you grant Full Disk Access. Only what is on that Mac. Deleted messages won't appear. Tested on fake files only, not on a real Mac. Windows has no route. |
| iPhone texts without a Mac | Can't | No supported way. Use your phone contacts export instead. |
| Google Voice and Android texts | Can | From a Google Takeout export or an SMS backup file. No live connection. Tested on fake files only. |
| Scheduled history sync | Can | Runs on your computer only while it is on and signed in. Status warns you when it goes quiet. |
| Zillow leads, direct or two-way | Can't | Zillow only connects to CRMs on its approved list. |
| Texting from the CRM, calling and call recording | Later | Needs Twilio, carrier registration and per-message costs. Not in this version. |
| Reading your personal phone's texts or calls live | Can't | A web app can't read them. Log what matters by hand. |
| Batch email and drips | Later | Will ship capped, with consent gates. Imported contacts never qualify by default. |
| Assistant login | Later | The first role to be added. Every row already records who created it. |
| MLS data and listings | Later | MLS feeds cost money and differ by MLS. Use a link field for now. |
| IDX search on your site | Won't | Use your MLS's own IDX option. The form feeds this CRM. |
| Native phone app | Won't | Too much upkeep for one maintainer. The web app works on a phone browser. |
| Transaction file, e-signing, compliance review | Won't | Not your transaction file. Keep that in your firm's system. |
| Official brokerage record | Can't | Record keeping stays your responsibility and your firm's. |
| Automatic Do Not Call scrubbing | Later | Needs a registry account or a paid vendor. It holds an opt-out flag and warns. |
| Legal compliance | Can't | It records consent and blocks known opt-outs. It can't judge whether a message is legal. Not legal advice. |
| Support, uptime or security guarantee | Won't | No support line and no promises. You run it. If Vercel, Supabase or Resend fail, so does this. |
| Lead routing and teams | Won't | One agent per install. |

## Connect your history, source by source

Your own AI agent runs the rescue tools on your own computer. The app never reads your phone or your Mac, and never holds your AI login. Your files stay on your computer, but anything your AI reads goes to your AI company's servers under your account. Turn off training on your data in your AI plan first.

| Source | Verdict | How | What stays on your computer (your AI company still sees what your AI reads) | Tested with |
|---|---|---|---|---|
| Gmail | Can | A Google Takeout mbox file, cleaned on your computer first. Second choice: your AI agent's Gmail connector, which sends headers and snippets to your AI company before any cleaning | Every email body and attachment | Fake mbox and a fake connector export. Not tested on a real mailbox. |
| Outlook | Can | An mbox export first. An Outlook connector sends email to your AI company before any cleaning | Every email body and attachment | Fake mbox only |
| iMessage | Can, Mac only | A read-only copy of the Messages database, after you grant Full Disk Access | Every message | A fake chat.db built by the test. Not tested on a real Mac. |
| Google Voice | Can | Google Takeout export: texts, call logs, voicemail transcripts | Message and transcript text | A fake Takeout folder written from public descriptions. Check it on a real export. |
| Phone contacts | Can | A .vcf export from your phone or Mac Contacts | Notes, addresses, birthdays | Fake .vcf |
| Android texts | Can | An XML file from an SMS backup app | Every message | Fake XML |
| iPhone texts without a Mac | Can't | No supported route | Everything | Not applicable |
| iMessage on Windows | Can't | Apple offers no route | Everything | Not applicable |
| Existing CRM export (Follow Up Boss, KW Command, a spreadsheet) | Can | CSV, columns matched by name | Columns that aren't matched | Fake CSV. Real export column names vary. |
| Closed-deal records | Can | CSV from your own records | Prices and commissions unless you add them | Fake CSV |
| Website lists | Can | CSV of signups | Everything else in the file | Fake CSV |
| Live sync from a web app alone | Can't | A website can't read your Mac or phone | Not applicable | Not applicable |
| Scheduled sync | Can | Runs on your computer while it is on and signed in. No AI, no upload of people, just a check-in | Everything | Command tested; scheduling itself not tested |

**What gets stored in the CRM:** name, email, phone, source, first and last contact dates, message counts, a short summary, a suggested stage and next step, each with a reason and the type of evidence. Not message text.

**What the automatic cleaning does not catch:** passport numbers, pre-approval letters, bank statements, tax forms, health details outside its word list, and why someone is really moving. The CRM refuses Social Security, card, account, routing and license numbers, passwords, wire details, and health and legal words, but it is a filter, not a guarantee. You read every summary before you approve it. That is the real check.

**Before you connect anything:** read your firm's policy and your independent contractor agreement. The other person in each message thread did not agree to AI processing. This is not legal advice.

## Who should not use this

- You buy Zillow leads.
- You run a team, route leads, or need an assistant login.
- You rely on texting from the CRM.
- You don't want to own a system. You are the IT department.
