# Where everything is

```
Your phone or computer
  └── Your CRM (your-crm.yourdomain.com, runs on Vercel)
        ├── Today ............ who to call: leads waiting, follow-ups due, deal dates this week
        ├── Contacts ......... everyone, with consent, source and source type on each
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
  └── GitHub ........... the code, and the nightly encrypted backup

On your own computer
  ├── This folder ...... the code and the guides
  ├── Rescue work folder (~/owncrm-rescue) ... your exports and review sheet. Never uploaded
  └── Your backup key .. in your password manager. Without it, backups can't be opened
```

## What happens when a lead comes in

1. Someone fills your web form, or Realtor.com emails a lead that you forward.
2. The CRM saves them, with the exact consent words they saw.
3. You get an email within a minute or two, with a tap-to-call link.
4. If you haven't logged a call, text or email after 5 minutes, you get another email. After 15, your backup contact gets one too.
5. Already replied from your phone? Tap "I replied" in the email. That only stops the reminders. It doesn't sign you in.

## What happens every few minutes

The scheduler runs reminders and alerts, then checks in with the outside watchdog. If it stops, the watchdog emails you within 30 minutes and every screen shows a red bar.
