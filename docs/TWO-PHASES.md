# Two phases, one folder

**1. Download.** Get this repository onto your computer.

**2. Rescue.** Your own AI agent, on your own computer, under your own login, runs the tools in `/rescue` (see `prompts/RESCUE.md`). Plain programs read your exports: Gmail or Outlook, iMessage on a Mac, Google Voice, phone contacts, old CRM files, closed deals, website signups. They keep dates, counts and short redacted snippets on your computer. Secrets like account numbers and passwords are removed before your AI sees anything. Family, friends, medical and legal threads are left out.

**3. Review.** Your AI suggests who is a real estate relationship, a short summary, a stage and a next step, using dates and how often you talked. You open a spreadsheet and type yes next to each person to keep. Nothing else goes anywhere.

**4. Check.** The tools write a folder in the shared format (`/contract`). `npm run contract:check <folder>` must say VALID. Now you own a clean list, even if you never build the app.

**5. Build.** When you're ready, your agent sets up the app (`prompts/BUILD.md`): database, hosting, email, two-step sign-in, backups, go-live checks. Or it builds its own from `SPEC.md`, as long as it reads the same folder.

**6. Import.** Select the folder's files on the Import page. Everyone comes in with unknown consent and no marketing. Nobody is emailed. One click undoes it.

**7. Keep it fresh.** A scheduled rescue on your computer re-reads your exports and checks in with the CRM. It only runs while that computer is on and signed in. New people wait for you to review them next time you open your agent, and arrive through Connect your history for approval. The Status page warns you if it stops.

**What never happens:** your messages are never copied into the CRM, nobody is messaged, and no one asks for your AI login.
