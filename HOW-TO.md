# How to

## Add a contact and a follow-up
Contacts, Add contact. Fill the name, an email or phone, and the first follow-up date. It shows on Today on that date.

## Log a call
Open the contact, "Log what happened", choose Call, write a line. This also stops no-reply alerts for that lead.

## Put the form on your website
Settings shows your form address. Link to it from your site ("Contact me"), or show it in a frame if your site allows. The words beside the checkbox are stored with each lead, exactly. Change them in Settings. Add `?source=Open%20house` to the address to label where a lead came from. Have your website also email you a copy, in case the CRM is down.

## Forward lead emails
Point your Realtor.com lead notifications (and others) at your receiving address on your email subdomain. Ones the CRM can read become leads. The rest go to Needs review.

## Import a spreadsheet
Import, choose the CSV, match the columns, check the preview, Import. Download the error file for rows that didn't fit. Undo is one click on the import's page. Nobody is emailed, and consent is unknown for everyone imported.

## Import a rescue folder
Import, "A rescue folder", select every file in the folder. If it doesn't pass the check, download the error file. It names the file, line and column of each problem.

## Connect your history
Connect your history, read the notice, create a token, give it to the rescue tool on your computer (never in a chat). Uploaded batches wait under "Batches waiting for you". Approve people, Save. Undo is on the batch page.

## Send an email
Open the contact, Email. "Sent" means your email provider accepted it. "Delivered" or "Bounced" appears when the provider reports back. Tick "This is marketing" only for marketing: it adds your address and an unsubscribe link, and needs recorded consent.

## Deals and key dates
Open the contact, Add a deal. Add key dates. Dates within 7 days show on Today. You get emails 7 days, 2 days and on the day, at the hour set in Settings.

## Weekly cleanup
Runs every Monday morning. Cleanup lists problems; it never changes a contact. Ignore what doesn't matter: it stays ignored.

## Go-live
Status, go-live checklist. Every item must pass: settings, verified domain, logged-out read test, signup off, test lead, test alert you confirm, test backup, watchdog check-in.

## Monthly check-up
1. Run `npm audit` and check the Next.js security page for your version (15.x).
2. Update with your agent, run `npm run gate`, deploy only if it passes.
3. Open Status: is everything green? When was the last restore drill?
4. Export everything and keep it somewhere safe.
5. Every 3 months: a restore drill (RESTORE.md).

## Daily all-clear
Settings, "Send me a daily all-clear email". Make the sender a VIP on your phone. No email by that time means something is wrong.
