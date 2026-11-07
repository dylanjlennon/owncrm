# Phase 2: Build your CRM and import your folder

Paste these into your own AI agent, in this folder, one at a time. Your agent will need you to click through some sign-up pages yourself. It should never ask for your passwords, and never ask you to paste a secret key into the chat. Keys go straight into `.env.local` or the hosting settings.

Before Prompt 1, do "Step 0" in README.md (Node.js 22.13 or newer, git, the download, `npm install`).

Expect about $45 to $65 a month once it is set up, plus an AI plan if you don't have one. See README.md.

The order matters: the app gets its address in Prompt 4 (deploy). Everything that needs that address (the email webhook, the watchdog, the backup report) comes after it.

### Prompt 1: check you're a fit

```
Read AGENTS.md, README.md and CAPABILITIES.md. Tell me in plain words who should not use this,
what it costs each month, and what it can't do. Ask me whether I buy Zillow leads, have a team or assistant,
or rely on texting. If yes to any, tell me this is the wrong tool and stop.
```

### Prompt 2: accounts

```
Walk me through creating these accounts, one at a time, waiting for me after each:
GitHub (private repository for this code), Supabase (Pro plan), Vercel (Pro plan), Resend, Healthchecks.io.
Turn on two-factor login on every one of them. Tell me why: anyone with these dashboard logins can read everything.
```

### Prompt 3: database

```
Help me create a new Supabase project. Then, in its SQL editor, run every file in supabase/migrations in name order
(there are five; paste each one whole and run it before the next).
Then in Authentication: turn OFF "Allow new users to sign up", turn ON TOTP multi-factor,
turn ON leaked password protection (Authentication, Passwords) if my plan has it,
and use "Add user" to create MY login with a long password from my password manager.
Then run this in the SQL editor with my user's id: insert into public.app_owner (user_id) values ('<my user id>');
Then run supabase/tests/rls.sql in the SQL editor and show me the result. Every test must pass.
Tell me plainly: public signup must stay OFF. Go-live will not finish while it is on.
```

### Prompt 4: deploy (this gives the app its address)

```
Copy .env.example to .env.local and fill in the Supabase values. Make each random secret on my computer with
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" (this works on Mac and Windows; openssl
is fine on a Mac too). Leave the Resend and Healthchecks values empty for now.
Push the code to my private GitHub repository (walk me through git if I have never used it).
Connect it to Vercel, copy every value from .env.local into Vercel, Settings, Environment Variables, and deploy.
Tell me my app's address (https://...vercel.app, or a subdomain of mine if I add one now), put it in APP_URL
in Vercel and .env.local, and redeploy. Confirm vercel.json's scheduled job is active (needs Pro).
```

### Prompt 5: email (needs the app address from Prompt 4)

```
Walk me through Resend: add a sending subdomain I control (for example mail.mydomain.com), add the DNS records,
and wait until it is verified. Create one webhook to https://<my app address>/api/webhooks/resend with delivery,
bounce, complaint and received events. For forwarded lead emails, set up receiving on a subdomain only
(never my main domain, or my normal email breaks). Put the API key and the two signing secrets in Vercel's
Environment Variables and in .env.local, never in chat. Redeploy.
```

### Prompt 6: the outside watchdogs

```
In Healthchecks.io, create TWO checks, each emailing me AND my backup contact:
1. "CRM app": every 15 minutes, 15 minutes grace. Put its ping address in HEALTHCHECK_PING_URL in Vercel. Redeploy. It means "the scheduler ran".
   Optional third check, "CRM checks": every 15 minutes, 15 minutes grace, ping address in HEALTHCHECK_CHECKS_URL. It goes down while the backup, self-test, test lead or sending is red.
2. "CRM backup": every 1 day, 2 hours grace. Keep its ping address for Prompt 8 (GitHub secret HEALTHCHECK_BACKUP_URL).
Explain: the first emails me if the app goes quiet; the second emails me if the nightly backup stops or fails,
even if GitHub never starts it.
```

### Prompt 7: first sign-in

```
Open my app. I'll sign in and scan the QR code with my authenticator app. Remind me to save the setup key
in my password manager: it is my way back in if I lose my phone. Then walk me through the first-run screen and Settings.
Leave "Send me a daily all-clear email" ticked (it is on by default) and help me make the sender a VIP on my phone.
```

### Prompt 8: backups

```
Set up the nightly backup in .github/workflows/backup.yml. On my computer, run age-keygen -o crm-backup-key.txt
(on Windows install it first with: winget install FiloSottile.age).
Put the public key (age1...) in the GitHub secret BACKUP_AGE_RECIPIENT. Put the private key file in my password manager
and NOT in the repository. Add the other secrets the workflow lists, including HEALTHCHECK_BACKUP_URL from Prompt 6.
Run the workflow once by hand and show me the result on my Status page and in the "CRM backup" check.
```

### Prompt 9: go-live

```
Open Status and walk me through every go-live item: test lead, test alert (I confirm I got it),
domain check, logged-out read test with public signup off, backup with its outside check, app watchdog,
and the daily all-clear. Don't mark anything done for me. When every item passes, I press Finish go-live.
Finish runs the logged-out read test again, so if signup was turned back on it refuses.
```

### Prompt 10: import my rescue folder

```
Run npm run contract:check on my rescue contract folder. If it passes, open Import in my app and show me
where to select every file in the folder. One upload can be up to 4 MB. If the folder is bigger, run
npm run contract:sql <folder> and help me paste the result into the Supabase SQL editor instead.
After the import, show me the result and the Undo button,
and remind me that everyone imported has unknown consent and gets no marketing email.
```

### Prompt 11: restore drill (do this before you rely on it)

```
Follow RESTORE.md with me into a brand new, empty Supabase project. Show me that every table count matches.
Then press "I finished a restore drill" on Status, and delete the drill project.
On Windows, install psql first (winget install PostgreSQL.PostgreSQL) and age (winget install FiloSottile.age).
```

## Build your own instead

If you'd rather have your agent write the app fresh, give it SPEC.md:

```
Read SPEC.md and AGENTS.md. Build the app it describes. It must import folders that pass
npm run contract:check, follow the refusal and merge rules in SPEC.md, and pass every acceptance test
in SPEC.md before you call it done.
```

An app built from SPEC.md reads the same folder. The rescue tools' upload, check-in and schedule commands only work
with it if it also implements "The history upload" in SPEC.md exactly. Otherwise, import the folder by hand.
