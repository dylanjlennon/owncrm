# How to

## Add a contact and a follow-up
Contacts, Add contact. Fill the name, an email or phone, and the first follow-up date. It shows on Today on that date.

## Change, snooze or repeat a follow-up
On Today or on the contact, each follow-up has Edit, Snooze and Done.
- **Edit** changes the words, the date, or how often it repeats.
- **Snooze** moves it to tomorrow, 3 days from now, next week or next month, counted from today.
- **Repeat** (every week up to every year): when you press Done, the next one appears on the list by itself.

## Birthdays and home anniversaries
Open a contact, Details. Pick the birthday month and day (the year is never asked for or kept, so the CRM never knows anyone's age) and the date they closed on their home. Today lists both for the next 30 days.

## Log a call
Open the contact, "Log what happened", choose Call, write a line. This also stops no-reply alerts for that lead.

## Put the form on your website
Settings shows your form address. Link to it from your site ("Contact me"). The form takes 10 posts per visitor address in 10 minutes. Each visitor address gets its own "New lead" email (and "No reply yet" reminders) for up to 3 leads a day. Past that, that address's leads come to you in a "Many new leads" list instead of one email each, and get no reminders. Leads from everyone else still get their own email. If more than 60 posts arrive in an hour from all visitors together, every post is still saved and you get one "Your web form is being flooded" email. Only past 600 an hour are posts turned away. To show it inside your own web page in a frame, add your site's address to `LEAD_FORM_FRAME_ANCESTORS` in your hosting settings (for example `https://www.yourdomain.com https://yourdomain.com`) and redeploy. Only the form can be framed, and only by the sites you list. Every other page refuses to be framed. The words beside the checkbox are stored with each lead, exactly. Change them in Settings. Add `?source=Open%20house` to the address to label where a lead came from. Have your website also email you a copy, in case the CRM is down.

## Forward lead emails
Point your Realtor.com, Zillow, Homes.com, Trulia or Redfin lead notifications at your receiving address on your email subdomain. Ones the CRM can read become leads. Everything else goes to Needs review, and you get an "An email needs review" email that names the sender and subject: one per sender every 12 hours, for at most 5 senders a day. The rest wait in Needs review.

How the CRM knows an email came from a lead site: only by the address it was sent from. The address must end in realtor.com, move.com, zillow.com, trulia.com, homes.com or redfin.com (for example `leads@email.realtor.com`). The name shown next to the address, the subject and the text don't count, because anyone can type "Zillow" there. Emails from those addresses have their own limits, so junk from other senders can't use up the hour: 30 an hour from each lead site address and 60 an hour from all of them together. Each lead from a lead site address gets its own "New lead" email, for the first 8 leads a day from that address. After that, that address's leads share 3 one-by-one emails a day, and the rest come in a "Many new leads" list.

Everything else is limited to 20 emails an hour from each sender and 100 an hour all together. Past either limit an email is still saved to Needs review, but not read. An email you forward by hand (so it comes from your own address) is still read if it names the lead site in the text, but it counts like any other sender: your own address gets 3 one-by-one "New lead" emails a day, and the rest go in the list.

If you set your lead site to send to your own inbox and then forward by hand, that works. If you use an automatic forwarding rule that keeps the original sender (Gmail's "forward a copy" does), the lead site's address is kept and the higher limits apply.

## Import a spreadsheet
Import, choose the CSV (up to 4 MB; split bigger files), match the columns, check the preview, Import. Undo is one click on the import's page. Nobody is emailed, and consent is unknown for everyone imported.
The file is checked the moment you upload it. Rows with a Social Security, routing, account or card number, or with health or legal words, are not saved at all, and the file itself is never saved. The error file lists the line number and the reason for each refused row, never the row itself: open your own copy of the file to fix those lines. Finish the import within a day; after that the uploaded rows are cleared and you upload again.

## Import a rescue folder
Import, "A rescue folder", select every file in the folder (up to 4 MB in all). If it doesn't pass the check, download the error file. It names the file, line and column of each problem. Rows that mention health or a legal matter, or hold a number shaped like a Social Security, routing or account number, are refused on purpose. Bigger folder: ask your agent to run `npm run contract:sql <folder>` and paste the result into the Supabase SQL editor.

## Connect your history
Connect your history, read the notice, create a token, and paste it yourself into the `owncrm.env` file in your rescue work folder (never in a chat, a crontab line or a scheduled task). `rescue schedule` makes that file and keeps it private. Uploaded batches wait under "Batches waiting for you". Approve people, Save. Undo is on the batch page.

## Send an email
Open the contact, Email. "Sent" means your email provider accepted it. "Delivered" or "Bounced" appears when the provider reports back. Tick "This is marketing" only for marketing: it adds your address and an unsubscribe link, and needs recorded consent.

## Deals and key dates
Open the contact, Add a deal. Add key dates. Dates within 7 days show on Today. You get emails 7 days, 2 days and on the day, at the hour set in Settings.

## Weekly cleanup
Runs every Monday morning. Cleanup lists problems; it never changes a contact. Ignore what doesn't matter: it stays ignored.

## Go-live
Status, go-live checklist. Every item must pass: settings, verified domain, logged-out read test, public signup off (checked again when you press Finish), test lead, test alert you confirm, test backup with its own outside check, app watchdog check-in, and the daily all-clear turned on.

## Updating (apply the database change first)
When an update comes with a new file in `supabase/migrations/`, apply the migration **first**, then deploy the app. The new app relies on the new database rules (for this round: `20261107000100_review_fixes.sql`, then `20261107000200_review_fixes_2.sql`, then `20261107000300_alert_gate.sql`, in that order). If `20261107000200_review_fixes_2.sql` stops with "Stopped before changing anything", your daily or monthly email limit is not higher than the number held back for alerts. Nothing was changed. The message gives two one-line fixes (hold back fewer emails for alerts, or raise the limit if your email plan allows it). Run one in the SQL editor, then run the file again. `20261107000300_alert_gate.sql` checks that `20261107000200_review_fixes_2.sql` finished. If it did not, `20261107000300_alert_gate.sql` stops with "has not finished on this database" and changes nothing: run 0200 first. Running 0100 or 0200 again after 0300 is safe. They leave the newer send rules in place. If the app goes live first, some buttons fail until the migration runs, and safety checks the app expects from the database are missing.
1. Back up (or check last night's backup is green on Status).
2. Ask your agent to apply the new migration files to your project, in name order (Supabase CLI `supabase db push`, or paste each file into the SQL editor and run it whole).
3. Then deploy the app, and run `npm run gate` before you do.
A backup taken before an update still restores afterwards (RESTORE.md).

## Monthly check-up
1. Run `npm audit` and check the Next.js security page for your version (15.x). Status shows the Next.js version you are running. Its "Last deploy" date is not an update check: any redeploy resets it.
2. Update with your agent, run `npm run gate`, deploy only if it passes.
3. Open Status: is everything green? When was the last restore drill?
4. Export everything and keep it somewhere safe.
5. Every 3 months: a restore drill (RESTORE.md).

## Daily all-clear
On by default (Settings, "Send me a daily all-clear email"). Every morning it reads every check on Status, not just what ran that minute, and says when the last backup finished and when the watchdog last heard from the app. "All clear" means every check is green. Make the sender a VIP on your phone. No email by that time means something is wrong.

## How many alert emails you can get
Alerts have their own share of your daily email limit (Settings, "Held back for alerts", 40 by default, at least 15). Client email gets the rest: with a limit of 100 a day, 60 client emails, however many alerts went out. Every email counts toward your monthly limit, alerts too. Client email stops one day's worth of alerts short of the monthly limit, so alerts can still go out at the end of a busy month. Settings won't save a daily or monthly limit that is not higher than the number held back for alerts, and won't save fewer than 15 held back for alerts.
The database makes every one of these decisions, one alert at a time, so form posts or emails that arrive at the same moment can't all slip through together.

With the default 40 a day, the 40 are split like this:
- **New leads:** up to 22 "New lead" emails a day, one per lead. 6 more are kept for the "Many new leads" list.
- **Reply reminders:** 4 are kept only for "No reply yet" and "Still no reply" (the second one also goes to your backup contact). That is enough for one lead's full set of reminders and one more. New-lead emails, the lead list and problem alerts can't use these 4. Past them, reminders come out of the 22 for new leads.
- **Problems:** up to 18 emails about red checks. 6 more are kept for escalations that also go to your backup contact ("backup stopped", test lead failed, sending paused). There are always at least 2, so "backup stopped" can reach both of you.
- **One "Alerts paused for today" email:** 1 is kept for it. The first time in a day that any of these shares runs out, you get this one email. It says which share ran out first and links to your new leads and Status. You get it at most once a day. Nothing is lost: every lead is still saved. Until midnight, check the CRM yourself.

If you set a different number, the shares grow or shrink with it. If you get "Alerts paused" on ordinary days, raise "Held back for alerts" in Settings (your email plan's daily limit has to allow it).

Other rules:
- A red check emails you once every 12 hours while it stays red, not every few minutes.
- Each web form address (or, for a lead site's lead, each person) gets its own "New lead" email and reminders for up to 3 leads a day. Past that, that address's leads are listed in a "Many new leads" email instead, without reminders. One noisy address can't stop the alerts for anyone else: a real lead from a new address still gets its own email at once, both reminders, and the "Still no reply" email to your backup contact.
- When the day's new-lead emails run out, every new lead goes in the list. The list comes at most once an hour, and less often when the day's share is low, so it lasts until midnight. Every lead is in a list. Leads in a list don't get "No reply yet" reminders, so read the list.
- New-lead alerts that failed are retried newest first.

**One limit to know about: visitors who share an address.** The "3 leads a day per address" rule counts the internet address a visitor's post came from. On Vercel that address can't be faked. But people on the same office network, the same hotel or coffee shop Wi-Fi, or some mobile carriers share one address. If more than 3 of them use your form on the same day, the 4th and later get listed in "Many new leads" instead of their own email, without reminders. Nothing is lost, but read the list. Don't put another service in front of the app (for example Cloudflare with its orange cloud on, or any other proxy or firewall that forwards requests). Then every visitor looks like one of that service's few addresses, and almost every lead goes to the list. Point your domain straight at Vercel (DNS only).

## The outside watchdog
Your "CRM app" check on Healthchecks.io (HEALTHCHECK_PING_URL) means one thing only: the scheduler ran. If the app, Vercel or the scheduler stops, the check goes quiet and Healthchecks emails you. A red check on Status (a stopped backup, history sync with your laptop off) does not hold it down, so a real outage always shows. Red checks reach you by email and on Status instead.
Optional: a second check, "CRM checks" (HEALTHCHECK_CHECKS_URL in Vercel, every 15 minutes), goes down while the backup, the logged-out read test, the test lead or sending is red. History sync, the email allowance and database size are left out of it.
If you don't set up a watchdog at all, a red check shows only in email and on Status. Vercel's cron log shows the scheduler ran, not that a check is red. Go-live needs the watchdog.

## What each red check means
| Red check | What it means | What to do |
|---|---|---|
| Scheduled job | The every-5-minutes job stopped | Vercel, your project, Cron Jobs. Check it is on and your plan is Pro |
| Outside watchdog check-in | The app could not reach Healthchecks | Check HEALTHCHECK_PING_URL in Vercel |
| Nightly backup | The backup failed or has not run for over a day | GitHub, your repository, Actions, the last "nightly-backup" run. Read the red step |
| Logged-out read test | A table answered without a login, or public signup is on | Signup on: turn it off in Supabase, Authentication. A table readable: stop using the app and get help |
| Weekly test lead | The fake lead did not make it from form to alert | Status, "Send a test lead", and read what it says |
| Sending domain verified | Your email DNS records changed | Resend, Domains. Fix the records it shows |
| Email sending | Sending paused itself after bounces or a spam complaint | Read the reason on Status first, then turn sending back on |
| Email allowance | Over 90% of today's or this month's email limit | Look for a loop or spam on your form. Raise the limit only if your plan allows it |
| Database size | Over 90% of your plan's database size | Export, then archive old contacts, or move to a bigger plan |
| History sync on your computer | The scheduled rescue has not checked in | Turn that computer on. If the token expired, make a new one and paste it in owncrm.env |

## Replace a leaked key
If a key was pasted into a chat, an email, a screenshot or a public repository, replace it. Don't wait.
1. **Make the new value.** Supabase service key: Supabase, Project Settings, API, roll the key (or create a new secret key and delete the old one). Resend API key: Resend, API Keys, create a new one, then delete the old one. Webhook secrets: delete and recreate the webhook in Resend. Your own random secrets (LINK_SIGNING_SECRET, CRON_SECRET, BACKUP_REPORT_SECRET, LEAD_FORM_KEY): make a new one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. **Put it everywhere it lives:** Vercel, Settings, Environment Variables, and your `.env.local`. BACKUP_REPORT_SECRET also lives in GitHub, Settings, Secrets.
3. **Redeploy** in Vercel, then open Status and run the checks.
4. **What changes for you:** a new LEAD_FORM_KEY changes your form address, so update the link on your website. A new LINK_SIGNING_SECRET makes old "I replied" and unsubscribe links stop working (unsubscribes already done stay done). A history token: revoke it on Connect your history and make a new one.
5. **A leaked dashboard login** (Supabase, Vercel, GitHub, Resend) is worse than a key: change that password, check its two-factor settings, and sign out other sessions there.

## Windows notes
- Use PowerShell. Paths look like `C:\Users\you\owncrm-rescue` instead of `~/owncrm-rescue`.
- No iMessage rescue (it needs a Mac). Google Voice, Android texts, contacts and CSV exports all work.
- `age` and `psql` aren't built in: `winget install FiloSottile.age` and `winget install PostgreSQL.PostgreSQL`.
- Random secrets: use the `node -e` command above instead of `openssl`.
- The scheduled rescue uses Task Scheduler. `rescue schedule` prints the exact settings.
