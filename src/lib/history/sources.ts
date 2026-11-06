// What each history source reads, keeps local, stores, and how to disconnect it.
// Shown on the Connect your history page and repeated in CAPABILITIES.md.
export type SourceCard = {
  key: string; title: string; route: string; reads: string; staysLocal: string; stored: string;
  disconnect: string; verdict: 'Can' | 'Later' | "Can't"; note?: string;
};
const STORED = 'Name, email, phone, first and last contact dates, message count, a short summary, a suggested stage and next step, and why. No message text.';
export const SOURCE_CARDS: SourceCard[] = [
  { key: 'gmail', title: 'Gmail', route: 'Your own Claude session with the Gmail connector. Fallback: a Google Takeout mbox file.',
    reads: 'Who you emailed and when, subjects, and short snippets, on your computer.', staysLocal: 'Every email body, attachment and snippet.', stored: STORED,
    disconnect: 'Remove the Gmail connector in your Claude settings, revoke the history token here, and delete the rescue work folder.', verdict: 'Can' },
  { key: 'outlook', title: 'Outlook', route: 'Your own Claude session with an Outlook connector if your account has one. Fallback: export to an mbox file.',
    reads: 'Who you emailed and when, subjects, and short snippets.', staysLocal: 'Every email body and attachment.', stored: STORED,
    disconnect: 'Remove the connector in your Claude settings and revoke the token here.', verdict: 'Can', note: 'PST files need converting to mbox first.' },
  { key: 'imessage', title: 'iMessage (Mac only)', route: 'A read-only copy of the Messages database on your Mac. You grant Full Disk Access to your terminal.',
    reads: 'Phone numbers and emails you texted, dates and counts, from a copy. The original is never opened for writing.', staysLocal: 'Every message.', stored: STORED,
    disconnect: 'Remove Full Disk Access from your terminal in System Settings, revoke the token here, and delete the work folder.', verdict: 'Can',
    note: 'Only sees what is on that Mac. Turn on Messages in iCloud first if you want older texts from your phone. Deleted messages will not appear. Windows has no iMessage route.' },
  { key: 'google_voice', title: 'Google Voice', route: 'A Google Takeout export of Voice. There is no direct connection.',
    reads: 'Texts, call logs and voicemail transcripts from the export files.', staysLocal: 'Message and transcript text.', stored: STORED,
    disconnect: 'Delete the Takeout folder and revoke the token here.', verdict: 'Can' },
  { key: 'phone_contacts', title: 'Phone contacts', route: 'Export your contacts as a vCard (.vcf) file from your phone or Mac Contacts.',
    reads: 'Names, emails and phone numbers.', staysLocal: 'Notes, addresses and birthdays on the cards.', stored: 'Name, email, phone and source.',
    disconnect: 'Delete the .vcf file and revoke the token here.', verdict: 'Can' },
  { key: 'android_sms', title: 'Android texts', route: 'An XML file from an SMS backup app, copied to your computer.',
    reads: 'Phone numbers, dates and counts.', staysLocal: 'Every message.', stored: STORED,
    disconnect: 'Delete the backup file and revoke the token here.', verdict: 'Can', note: 'Tested only with a fake backup file.' },
  { key: 'iphone_no_mac', title: 'iPhone texts without a Mac', route: 'Not supported.',
    reads: 'Nothing.', staysLocal: 'Everything.', stored: 'Nothing.', disconnect: 'Nothing to disconnect.', verdict: "Can't",
    note: 'Without a Mac there is no supported way to read iPhone texts. Use phone contacts instead.' },
  { key: 'crm_export', title: 'Existing CRM export', route: 'A CSV export from your old CRM. Small files can also use Import in this app.',
    reads: 'The columns you map.', staysLocal: 'Columns you leave unmapped.', stored: STORED, disconnect: 'Revoke the token here.', verdict: 'Can' },
  { key: 'deal_records', title: 'Closed-deal records', route: 'A CSV of your closed deals, from your own records.',
    reads: 'Client names, contacts and closing dates.', staysLocal: 'Prices, commissions and file details unless you add them by hand.', stored: STORED,
    disconnect: 'Revoke the token here.', verdict: 'Can', note: 'Your firm\'s transaction system stays the official record.' },
  { key: 'website_lists', title: 'Website lists', route: 'A CSV export of your website or newsletter signups.',
    reads: 'Names, emails and signup dates.', staysLocal: 'Anything else in the file.', stored: 'Name, email, signup date and source. Consent stays unknown until you confirm it.',
    disconnect: 'Revoke the token here.', verdict: 'Can' },
];
