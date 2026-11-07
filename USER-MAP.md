# Where everything is

```
Your phone or computer
  └── Your CRM (your-crm.yourdomain.com, runs on Vercel)
        ├── Today ............ who to call: leads waiting, follow-ups due (edit, snooze, repeat), deal dates this week,
        │                      birthdays and home anniversaries in the next 30 days
        ├── Contacts ......... everyone, with consent, source and source type on each.
        │                      A rescued summary shows at the top, under "From your rescue"
        ├── Deals ............ key dates (not your transaction file)
        ├── Needs review ..... forwarded emails we couldn't read. Nothing is dropped
        ├── Email ............ what you sent and whether it arrived
        ├── Import ........... spreadsheets and rescue folders, with one-click undo
        ├── Connect your history ... sources, history token, batches waiting for you
        ├── Cleanup .......... duplicates, missing next steps, stale deals, weekly
        ├── Status ........... is everything working? You are the IT department
        ├── Export ........... everything, any time
        └── Settings ......... alerts, time zone, sending, form wording

Behind it (you have a login to each; protect them with two-step sign-in)
  ├── Supabase ......... the database. Your data lives here
  ├── Resend ........... sends your email and receives forwarded lead emails
  ├── Healthchecks.io .. the outside watchdog. Emails you if the app goes quiet
  └── GitHub ........... your PRIVATE copy of the code, and the nightly encrypted backup

On your own computer
  ├── This folder ...... the code and the guides. Never put exports, the rescue folder or your backup key here
  ├── Rescue work folder (~/owncrm-rescue, outside this folder) ... your exports and review sheet. Never uploaded to the CRM.
  │                      What your AI reads from it goes to your AI company under your account
  └── Your backup key .. in your password manager, not in a file. Without it, backups can't be opened
```

## What happens when a lead comes in

1. Someone fills your web form, or Realtor.com emails a lead that you forward.
2. The CRM saves them, with the exact consent words they saw.
3. You get an email within a minute or two, with a tap-to-call link.
4. If you haven't logged a call, text or email, you get another email 5 to 10 minutes after the lead came in (the scheduler runs every 5 minutes, so it can be up to 5 minutes late). After 15 to 20 minutes, your backup contact gets one too.
5. Already replied from your phone? Tap "I replied" in the email. That only stops the reminders. It doesn't sign you in.

## What happens every few minutes

The scheduler runs reminders and alerts, checks every item on Status, emails you once (per 12 hours) about anything red, then checks in with the outside watchdog. The check-in means "the scheduler ran", even when something on Status is red. If the scheduler stops, the watchdog emails you within 30 minutes and every screen shows a red bar.

## What happens every night

GitHub runs the encrypted backup, checks it, reports to Status, and pings its own outside check. If the backup fails, or never starts, you get an email.
