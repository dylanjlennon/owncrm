# Two phases, one folder

**1. Download.** Install Node.js 22.13 or newer and git, get this repository onto your computer, and run `npm install`. The steps for Mac and Windows are under "Step 0" in README.md.

**2. Rescue.** Your own AI agent, under your own account, runs the tools in `/rescue` (see `prompts/RESCUE.md`). Plain programs on your computer read your exports: Gmail or Outlook, iMessage on a Mac, Google Voice, phone contacts, old CRM files, closed deals, website signups. They keep dates, counts and short snippets, and try to strip account, card, Social Security and license numbers, passwords and wire details. Threads they tag as family, medical or legal are left out. Then your AI reads the cleaned snippets, in batches. **That step goes to your AI company's servers**, so turn off training on your data first. The cleaning is a filter, not a guarantee: it misses passport numbers, pre-approvals, bank statements, tax forms and health details outside its word list.

**3. Review.** Your AI suggests who is a real estate relationship, a short summary, a stage and a next step, using dates and how often you talked. You open a spreadsheet, read every summary, and type yes next to each person to keep. This is the real safety check: the automatic checks miss things.

**4. Check.** The tools write a folder in the shared format (`/contract`). `npm run contract:check <folder>` must say VALID. Now you own a clean list, even if you never build the app.

**5. Build.** When you're ready, your agent sets up the app (`prompts/BUILD.md`): database, hosting, email, two-step sign-in, backups, go-live checks. Or it builds its own from `SPEC.md`, as long as it reads the same folder.

**6. Import.** Select the folder's files on the Import page. Everyone comes in with unknown consent and no marketing. Nobody is emailed. One click undoes it.

**7. Keep it fresh.** A scheduled rescue on your computer re-reads your exports and checks in with the CRM. It only runs while that computer is on and signed in. New people wait for you to review them next time you open your agent, and arrive through Connect your history for approval. The Status page warns you if it stops.

**What never happens:** your messages are never copied into the CRM, nobody is messaged, and no one asks for your AI login or stores an AI key.
