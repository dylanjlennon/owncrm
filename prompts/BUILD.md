# Phase 2: Build your CRM and import your folder

Paste these into your own AI agent, in this folder, one at a time. Your agent will need you to click through some sign-up pages yourself. It should never ask for your passwords, and never ask you to paste a secret key into the chat. Keys go straight into `.env.local` or the hosting settings.

Expect about $45 to $65 a month once it is set up. See README.md.

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
Help me create a new Supabase project. Then, in its SQL editor, run every file in supabase/migrations in name order.
Then in Authentication: turn OFF "Allow new users to sign up", turn ON TOTP multi-factor,
turn ON leaked password protection (Authentication, Passwords) if my plan has it,
and use "Add user" to create MY login with a long password from my password manager.
Then run this in the SQL editor with my user's id: insert into public.app_owner (user_id) values ('<my user id>');
Then run supabase/tests/rls.sql in the SQL editor and show me the result. Every test must pass.
```

### Prompt 4: email

```
Walk me through Resend: add a sending subdomain I control (for example mail.mydomain.com), add the DNS records,
and wait until it is verified. Create one webhook to https://<my app address>/api/webhooks/resend with delivery,
bounce, complaint and received events. For forwarded lead emails, set up receiving on a subdomain only
(never my main domain, or my normal email breaks). Put the API key and signing secrets in .env.local, never in chat.
```

### Prompt 5: deploy

```
Fill .env.local from .env.example. Generate the random secrets with openssl rand -hex 32 on my computer.
Push the code to my private GitHub repository. Connect it to Vercel, copy every setting into
Vercel, Settings, Environment Variables, and deploy. Confirm vercel.json's scheduled job is active (needs Pro).
Create a Healthchecks.io check every 15 minutes with a 15 minute grace period, email alerts to me AND my backup contact,
and put its ping address in HEALTHCHECK_PING_URL.
```

### Prompt 6: first sign-in

```
Open my app. I'll sign in and scan the QR code with my authenticator app. Remind me to save the setup key
in my password manager: it is my way back in if I lose my phone. Then walk me through the first-run screen and Settings.
```

### Prompt 7: backups

```
Set up the nightly backup in .github/workflows/backup.yml. On my computer, run age-keygen -o crm-backup-key.txt.
Put the public key (age1...) in the GitHub secret BACKUP_AGE_RECIPIENT. Put the private key file in my password manager
and NOT in the repository. Add the other secrets the workflow lists. Run the workflow once by hand and show me
the result on my Status page.
```

### Prompt 8: go-live

```
Open Status and walk me through every go-live item: test lead, test alert (I confirm I got it),
domain check, logged-out read test, backup, watchdog. Don't mark anything done for me. When every item passes,
I press Finish go-live.
```

### Prompt 9: import my rescue folder

```
Run npm run contract:check on my rescue contract folder. If it passes, open Import in my app and show me
where to select every file in the folder. After the import, show me the result and the Undo button,
and remind me that everyone imported has unknown consent and gets no marketing email.
```

### Prompt 10: restore drill (do this before you rely on it)

```
Follow RESTORE.md with me into a brand new, empty Supabase project. Show me that every table count matches.
Then press "I finished a restore drill" on Status, and delete the drill project.
```

## Build your own instead

If you'd rather have your agent write the app fresh, give it SPEC.md:

```
Read SPEC.md and AGENTS.md. Build the app it describes. It must import folders that pass
npm run contract:check, and it must pass every acceptance test in SPEC.md before you call it done.
```
