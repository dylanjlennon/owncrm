# Questions

**Is this free?** The software is free and open source (AGPL-3.0). Running it is not. A safe setup costs about $45 to $65 a month for the host, the database with backups, email and a domain, plus an AI plan (about $20 a month) if you don't already pay for one. Free plans aren't safe for a business: Vercel's free plan is non-commercial, and Supabase's free plan has no backups and pauses.

**Can I set this up with ChatGPT or Claude in my web browser?** No. A chat in a browser can't open files or run programs on your computer. You need an AI agent that runs on your computer, like Claude Code or Codex. README.md, Step 0, has the install line for Mac and Windows.

**Do I need to use git?** No. The Deploy button in README.md makes your own private copy on GitHub and puts it live, with no terminal. You still type a few commands in Step 0 to install the tools and download the code your AI agent reads.

**Is it a Follow Up Boss replacement?** No. It has no texting, calling, Zillow sync, team features or support line. You get ownership: the data, the code and the backups are yours.

**Who looks after it?** You. You are the IT department. The Status page, the red bar, the watchdog email and the daily all-clear tell you when something needs you.

**What if I lose my phone?** See RECOVERY in SETUP-WITH-CLAUDE.md. Save your authenticator setup key in your password manager on day one.

**Can my assistant log in?** Not in this version. One login per install. An assistant role is the first thing planned.

**Does it work with Zillow?** Not directly. Zillow only connects to CRMs on its approved list.

**Does it read my texts?** Not by itself. A web app can't read your phone. If you have a Mac, your own AI agent can read a copy of your iMessage history on that Mac, during "Connect your history", and only summaries and dates come into the CRM. There is no route for iMessage on Windows, or for iPhone texts without a Mac.

**Will my AI see my clients' private details?** Some, yes. Your files stay on your computer, but your AI agent's model runs on the AI company's servers, so whatever your AI reads is sent to that company under your account. The rescue tools try to remove account, routing, card, Social Security and license numbers, passwords and wire details first, and they skip threads they tag as medical, legal or family. That is a filter, not a guarantee. It does not catch passport numbers, pre-approval letters, bank statements, tax forms, health details outside its word list, or why someone is really moving. If you use a Gmail or Outlook connector in your AI app instead of an export file, the email goes to the AI company before any local cleaning runs. Before you start: turn off "use my data for training" in your AI plan's settings, read your firm's AI policy, and remember the people you message didn't agree to AI processing.

**Does the CRM store my AI login?** No. The app never stores an AI login, and it has no place to store an AI key either. Your AI agent runs on your own computer under your own account. Never put a Claude.ai or ChatGPT login anywhere in this app.

**Can I email my whole list?** Not in this version. One-to-one email only. Imported people have unknown consent and can't get marketing email until you record their consent.

**Someone asked me to stop emailing them.** Open their contact, Record consent, choose "Asked to stop". Their address goes on the opt-out list for good, and the database refuses every send to it.

**Is this my official transaction record?** No. Keep transaction files in your firm's system. NC requires brokers to keep records, and that stays your responsibility and your firm's.

**Is this legal advice?** No. It records consent and blocks known opt-outs. It can't tell you whether a message or a use of data is allowed.

**What if a forwarded lead email changes format?** It lands in Needs review and you get an email naming the sender and subject. Nothing is lost. The reader for Realtor.com, Zillow, Homes.com, Trulia and Redfin emails was built from samples; check it against a real lead email from each site you use, after setup.

**Can someone send me fake leads by putting "Zillow" in an email?** Not past the limits. The CRM decides an email came from a lead site only by the address it was sent from (realtor.com, move.com, zillow.com, trulia.com, homes.com or redfin.com), never by the name, subject or text. Anything else is limited to 20 an hour per sender and 100 an hour in all, and a lead read from it counts as that one sender for the "3 leads a day" rule. A sender's address can still be forged, so lead site addresses are limited too (30 an hour each, 60 in all), and one address gets its own "New lead" emails for 8 leads a day before its leads share one sender's 3.

**What is the "Alerts paused for today" email?** Alerts have a daily allowance split into shares (HOW-TO, "How many alert emails you can get"). The first time in a day that a share runs out, you get this one email, saying which one. Every lead is still saved. Until midnight, check New leads and Status yourself. If it comes on ordinary days, raise "Held back for alerts" in Settings.

**Why do several leads from the same office come in a list?** The form gives each visitor address 3 one-by-one "New lead" emails a day. People on one office network, hotel Wi-Fi or some mobile carriers share an address. The 4th lead from that address is in the "Many new leads" list instead, without reminders. Nothing is lost. Don't put Cloudflare's proxy (orange cloud) or another proxy in front of the app: every visitor would then share a few addresses.

**What happens if Vercel, Supabase or Resend has an outage?** The CRM goes down with it. The outside watchdog emails you. Leads sent to your form during an outage are lost, so also have your form email you a copy.

**What happens if spam floods my web form?** Nothing is lost. One visitor address can send 10 posts in 10 minutes; more are turned away without blocking anyone else. Each address gets one-by-one "New lead" emails for 3 leads a day; after that its leads come in a "Many new leads" list, about once an hour. A real lead from any other address still gets its own email, its reminders and the email to your backup contact. If more than 60 posts arrive in an hour you also get one "Your web form is being flooded" email. If a flood comes from many addresses at once and uses up the day's lead emails, the rest go in the list too, so read it.

**Why did the importer refuse a row about a house?** The health and legal word list is careful, but it lets ordinary real estate wording through: street names ("Prison Camp Rd", "Hospital Dr"), buildings ("old jail renovated into lofts", "close to Mission Hospital"), "no pending litigation" in an HOA disclosure, "foreclosure listing", "full rehab", "a stroke of luck". The same words about a person are still refused, and so is wording that is as often about a person: "needs rehab", "rehab costs" with no house word near it, "foreclosure sale", "without bankruptcy", "former prison inmate", "the old county jail" (with no building word after it), and a street word followed by a name ("Center Dr Patel"). Rewrite those cells ("needs a full rehab", "kitchen rehab costs") or leave them out. A zip code next to a year ("28801 2019") is no longer read as a Social Security number. Very long cells (over 10,000 characters) are refused as "too long to check".

**The rescue refused some of my AI's summaries. Why?** Review lists each one with the word it refused and the rule: a word about who someone is (race, religion, age, family), a health or legal word, something shaped like an account or ID number, or text that reads like an instruction. Have your agent rewrite that summary without the word and run review again. Place names like Black Mountain, Old Fort and White Oak are allowed.

**I typed yes on someone on my block list. Why aren't they in the folder?** The block list always wins, so family, friends, doctors and lawyers can't slip in by a slip of the keyboard. Build tells you who it left out. To keep someone, take them off blocklist.txt and run aggregate, review and build again.

**Where are my rescue summaries after the import?** At the top of each contact's page, under "From your rescue". They are saved as that contact's Notes.

**Does the CRM keep the spreadsheets I import?** No. It keeps only the rows that passed the checks, and only until you finish the import (or a day). Refused rows are never saved, not even in the error file, which lists line numbers and reasons only.

**Will an old backup still restore after an update?** Yes. If an update removed a table, the restore skips that table, says so, and checks every other table. Birthdays saved with a year lose the year on restore, as they do in the app.
