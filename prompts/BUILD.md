# Phase 2: Build your CRM and import your folder

Paste these into your own AI agent, in this folder, one at a time. Your agent will need you to click through some sign-up pages yourself. It should never ask for your passwords, and never ask you to paste a secret key into the chat. Keys go straight into `.env.local` or the hosting settings.

Before Prompt 1, do "Step 0" in README.md (an AI agent that can run commands, Node.js 22.13 or newer, git, the download, `npm install`).

Expect about $45 to $65 a month once it is set up, plus an AI plan if you don't have one. See README.md.

The order matters: the app gets its address in Prompt 4 (deploy). Everything that needs that address (the email webhook, the watchdog, the backup report) comes after it.

**Keep one entry in your password manager called "OwnCRM".** Every time a step below says "save it", put it there: the database password, your random settings, the backup key. You will need several of them again later.

### Prompt 1: check you're a fit

```
Read AGENTS.md, README.md and CAPABILITIES.md. Tell me in plain words who should not use this,
what it costs each month, and what it can't do. Ask me whether I buy Zillow leads, have a team or assistant,
or rely on texting. If yes to any, tell me this is the wrong tool and stop.
```

### Prompt 2: accounts

```
Walk me through creating these accounts, one at a time, waiting for me after each. Use the steps below.
Turn on two-factor login on every one of them. Tell me why: anyone with these dashboard logins can read everything.
```

| Site | What to click |
|---|---|
| GitHub | github.com, Sign up. Then your picture (top right), Settings, Password and authentication, enable two-factor authentication. |
| Supabase | supabase.com, Start your project, Continue with GitHub. Then Organization settings, Billing, upgrade to Pro. Two-factor: your account (top right), Account preferences, Multi-factor authentication. |
| Vercel | vercel.com, Sign Up, Continue with GitHub. Choose Pro when it asks for a plan (or later: Settings, Billing). Two-factor: Account Settings, Authentication. |
| Resend | resend.com, Sign up. Two-factor: Settings, Security (or your profile). |
| Healthchecks.io | healthchecks.io, Sign Up (the free plan is enough). Two-factor: Account Settings, Two-factor authentication. |

Menu names change now and then. If one doesn't match, your agent can find the current one on that site's help page.

### Prompt 3: database

```
Help me create a new Supabase project (New project, pick a name and the region closest to me).
When Supabase asks for a Database Password, tell me to press Generate a password and SAVE IT in my password manager now.
It is shown only once, and the nightly backup needs it in Prompt 8.
Then, in its SQL editor, run every file in supabase/migrations in name order, oldest first. Paste each file whole
and press Run before the next. List the files for me first and count them with me so none is skipped.
Lines that start with NOTICE (for example "does not exist, skipping") are normal. Only a red ERROR means stop.
Then in Authentication: turn OFF "Allow new users to sign up" (Authentication, Sign In / Providers, user signups),
but leave the Email provider itself ON: turning off the Email provider breaks sign-in with "That email or password did not work".
Turn ON TOTP multi-factor, turn ON leaked password protection (Authentication, Passwords) if my plan has it,
and use "Add user" to create MY login with a long password from my password manager.
Then run this in the SQL editor with my user's id: insert into public.app_owner (user_id) values ('<my user id>');
Then run supabase/tests/rls.sql in the SQL editor and show me the result. Every test must pass.
Tell me plainly: public signup must stay OFF. Go-live will not finish while it is on.
```

There are 7 files in `supabase/migrations` today, from `20261106000100_core.sql` to `20261107000300_alert_gate.sql`. If an update adds more, run those too: the rule is every file, in name order.

### Prompt 4: deploy (this gives the app its address)

```
Help me deploy my own private copy of the app, using the Deploy button in README.md ("Your own private copy").
No terminal and no git needed. Before I press it, show me the table in prompts/BUILD.md, Prompt 4, that says
where each value comes from, and wait while I collect them. Never ask me to paste a value into this chat.
After it deploys, help me check on GitHub that my new repository says Private, then set APP_URL and redeploy.
```

**The main path: the Deploy button.**
1. In README.md, press **Deploy** (the "Deploy with Vercel" button). Sign in to Vercel with GitHub if it asks.
2. Vercel asks for a name for your copy and makes the repository on your GitHub. Make sure it is set to private (Vercel's screen has a private repository option; leave it on).
3. Vercel then shows one box per setting. Fill each one straight from Supabase or your password manager:

| Setting | Where it comes from |
|---|---|
| SUPABASE_URL | Supabase, your project, the Connect button at the top (or Project Settings, Data API): "Project URL", like `https://abcdefgh.supabase.co` |
| SUPABASE_ANON_KEY | Supabase, Project Settings, API Keys: the **Publishable key** (starts `sb_publishable_`). Older projects call it the "anon public" key. |
| SUPABASE_SERVICE_ROLE_KEY | Same page: a **Secret key** (starts `sb_secret_`; press the eye or Reveal to copy it). Older projects call it "service_role". Server only. Never share it. |
| LINK_SIGNING_SECRET | Your password manager's "generate password": 64 characters, letters and numbers only (turn symbols off). Save it. |
| CRON_SECRET | Same, a new one. Save it. |
| BACKUP_REPORT_SECRET | Same, a new one. Save it: Prompt 8 needs it again. |
| LEAD_FORM_KEY | Same, but 24 characters. It becomes part of your form's address. |

4. Press **Deploy** and wait for "Congratulations". Your app's address is shown (like `https://owncrm-pat.vercel.app`).
5. In Vercel, your project, Settings, Environment Variables, add `APP_URL` with that address (or a subdomain of yours if you add one now). Then Deployments, the newest one, the "..." menu, **Redeploy**.
6. Open your new repository on GitHub (github.com, your name, owncrm). Next to its name it must say **Private**. If it says Public: Settings, scroll to Danger Zone, Change repository visibility, Private.
7. Vercel, your project, Settings, Cron Jobs: check the scheduled job is listed and on (it needs the Pro plan).
8. Until Prompt 8 is done, GitHub may email you that "nightly-backup" failed. That is expected.

Resend and Healthchecks values are left out for now. They come in Prompts 5 and 6.

**Other way: "Use this template".** On https://github.com/dylanjlennon/owncrm press "Use this template", "Create a new repository", choose **Private**. Then Vercel, Add New, Project, Import that repository, open "Environment Variables" and add the same settings from the table, then Deploy. Then steps 4 to 8 above.

**Advanced (you know git):**
```
Copy .env.example to .env.local and fill in the Supabase values. Make each random secret on my computer with
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" (this works on Mac and Windows; openssl
is fine on a Mac too). Write them straight into .env.local; don't show them in the chat. Leave the Resend and
Healthchecks values empty for now. Create an empty PRIVATE repository on my GitHub, point this folder's git remote
at it and push (GitHub needs a sign-in helper or token for this; GitHub Desktop or "gh auth login" is easiest).
Connect it to Vercel, copy every value from .env.local into Vercel, Settings, Environment Variables, and deploy.
Put my app's address in APP_URL in Vercel and .env.local, and redeploy. Confirm vercel.json's scheduled job is active (needs Pro).
```

### Prompt 5: email (needs the app address from Prompt 4)

You need a domain you control (for example `patsample.com`) and the login for the company you bought it from (your "registrar"). A brokerage domain you can't change won't work, and neither will a Gmail address.

```
Walk me through Resend, using the steps and tables in prompts/BUILD.md, Prompt 5. Ask me which company my domain is with.
Add a sending subdomain in Resend (for example mail.mydomain.com, never my main domain), turn on Receiving for it,
then help me add each DNS record Resend shows at my registrar, one at a time, and press Verify in Resend.
If it isn't verified after an hour, go through the "Not verified after an hour?" list with me.
Then create one webhook to https://<my app address>/api/webhooks/resend with delivery, bounce, complaint and
received events. Put the API key and the two signing secrets in Vercel's Environment Variables (and in .env.local
only if I use the advanced path), never in chat. Redeploy.
```

**1. In Resend:** Domains, Add Domain, type your subdomain (`mail.patsample.com`), pick the region nearest you, and turn on Receiving. Resend shows a list of records. Keep that page open.

**2. Where to add them, by registrar:**

| Your domain is with | Where to add records |
|---|---|
| GoDaddy | Sign in, DNS in the left menu (or My Products, your domain, DNS), **Add New Record** |
| Namecheap | Domain List, **Manage** next to the domain, **Advanced DNS**, **Add New Record**. MX records go under "Mail Settings": switch it to **Custom MX** first |
| Squarespace (and old Google Domains, which moved to Squarespace) | Domains, your domain, **DNS** (DNS Settings), Custom records, **Add record** |
| Cloudflare | Your domain, **DNS**, Records, **Add record**. Set Proxy status to **DNS only** (grey cloud) for every one of these |
| Other | Search the registrar's help for "add DNS record" |

Shortcut: for GoDaddy and Cloudflare, Resend may offer **Auto configure** (or "Sign in to Cloudflare"), which adds the records for you.

**3. What the records look like** for `mail.patsample.com`. Your values come from Resend's page; copy them, don't type them. In the Name box, most registrars want only the part before your domain (type `send.mail`, not `send.mail.patsample.com`).

| Type | Name (Host) | Value (Content, Points to) | Priority |
|---|---|---|---|
| MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com` (Resend shows yours) | 10 |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | |
| TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEB...` (a long value: copy all of it from Resend) | |
| MX | `mail` (receiving forwarded lead emails) | The receiving value Resend shows for your region | 10 |

Leave TTL at its default (Auto, or 1 hour). Your normal email at `patsample.com` is not touched, because every record is on the `mail` subdomain.

**4. How you know it worked.** In Resend, Domains, press **Verify DNS records**. Each record turns green and the domain says **Verified**. It is often minutes, sometimes a few hours. Later, the app's Status page shows "Sending domain verified" in green too.

**Not verified after an hour?** Ask your agent to go through this with you:
- Press Verify again in Resend. It doesn't always re-check by itself.
- Ask your agent to look the records up, for example `nslookup -type=TXT send.mail.patsample.com` and `nslookup -type=MX send.mail.patsample.com` (works on Mac and Windows). No answer means the record isn't there yet, or the name is wrong.
- The name has your domain twice (`send.mail.patsample.com.patsample.com`): the registrar added it for you. Type only `send.mail`.
- The value was cut short or got extra quote marks. Copy it again, whole.
- Cloudflare: the cloud must be grey (DNS only), not orange.
- Namecheap: MX records only work with Mail Settings set to Custom MX.
- An old MX or TXT record already on the same name: delete the old one.
- Still pending after 72 hours: send the table above to your registrar's support and ask them to add the records, or contact Resend support.

### Prompt 6: the outside watchdogs

```
In Healthchecks.io, create TWO checks (a third is optional), each emailing me AND my backup contact.
Tell my backup contact to click the confirm link Healthchecks emails them, or they get nothing.
1. "CRM app": every 15 minutes, 15 minutes grace. Put its ping address in HEALTHCHECK_PING_URL in Vercel. Redeploy. It means "the scheduler ran".
2. "CRM backup": every 1 day, 2 hours grace. Keep its ping address for Prompt 8 (GitHub secret HEALTHCHECK_BACKUP_URL).
3. Optional, "CRM checks": every 15 minutes, 15 minutes grace, ping address in HEALTHCHECK_CHECKS_URL in Vercel.
   It goes down while the backup, self-test, test lead or sending is red.
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
Set up the nightly backup in .github/workflows/backup.yml with me, using the steps in prompts/BUILD.md, Prompt 8.
Install age on my computer first. Make the key in my HOME folder, never inside the owncrm folder.
Have me put the private key in my password manager. Never show the private key in this chat.
Then walk me through adding each GitHub secret in my private repository, and running the workflow once by hand.
Show me the result on my Status page and in the "CRM backup" check.
```

**1. Install `age`** (the tool that locks the backup):
- Mac: `brew install age`. No Homebrew? Install it first with the one line on brew.sh: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`, then follow the two "Next steps" lines it prints, then `brew install age`.
- Windows: `winget install FiloSottile.age`, then close and reopen PowerShell.

**2. Make the key in your home folder**, not in the owncrm folder:
- Mac: `age-keygen -o ~/crm-backup-key.txt`
- Windows: `age-keygen -o $HOME\crm-backup-key.txt`

It prints `Public key: age1...`. That public line is safe to share. The file holds the private key (a line starting `AGE-SECRET-KEY-`). Open the file, copy everything in it into your password manager's "OwnCRM" entry (or attach the file there), then delete the file. Without that private key, no backup can ever be opened. Never put it in the owncrm folder or on GitHub.

**3. Add the secrets on GitHub.** Your private repository, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. One at a time:

| Secret name | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase, your project, the **Connect** button at the top, **Session pooler**, copy the connection string. Replace `[YOUR-PASSWORD]` in it with the database password you saved in Prompt 3 (no brackets). |
| `BACKUP_AGE_RECIPIENT` | The `age1...` public key from step 2 |
| `OWNCRM_URL` | Your app's address, like `https://owncrm-pat.vercel.app` |
| `BACKUP_REPORT_SECRET` | The same value you gave Vercel in Prompt 4 (from your password manager) |
| `HEALTHCHECK_BACKUP_URL` | The "CRM backup" ping address from Prompt 6 |

Lost the database password? Supabase, Project Settings, Database, **Reset database password**. Then update `SUPABASE_DB_URL` here.

**4. Run it once by hand.** Your repository, the **Actions** tab, **nightly-backup** on the left, the **Run workflow** button on the right, then the green **Run workflow** in the box. If Actions asks you to enable workflows first, say yes. Wait about 3 minutes. A green tick means it worked. A red cross: open it, read the red step, and show it to your agent. Then Status in the app says when the last backup finished, and the "CRM backup" check is green.

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
The check counts households, people, summaries and closed deals; the summary count should match the people
I approved with a summary. After the import, show me the result and the Undo button, open one contact and show me
its "From your rescue" summary at the top, and remind me that everyone imported has unknown consent and gets no
marketing email.
```

### Prompt 11: restore drill (do this before you rely on it)

```
Follow RESTORE.md with me into a brand new, empty Supabase project. Show me that every table count matches.
Then press "I finished a restore drill" on Status, and delete the drill project.
On Windows, install psql first (winget install PostgreSQL.PostgreSQL) and age (winget install FiloSottile.age).
On a Mac, install psql with: brew install libpq (then follow the line it prints to add it to my PATH).
For the drill, have me copy the private backup key from my password manager into crm-backup-key.txt in my
home folder (never the owncrm folder), and delete that file again when the drill is done.
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
