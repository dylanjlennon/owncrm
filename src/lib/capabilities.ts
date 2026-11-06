// "What this can and can't do". The app page and CAPABILITIES.md come from the same list;
// a test checks they match.
export type Cap = { item: string; verdict: 'Can' | 'Later' | "Can't" | "Won't"; truth: string };
export const CAPABILITIES: Cap[] = [
  { item: 'Contacts, notes, follow-ups and deal dates in a database you own', verdict: 'Can', truth: 'One owner login with a second factor. Every row is locked to you by the database.' },
  { item: 'Website leads, forwarded lead emails and CSV files', verdict: 'Can', truth: 'Realtor.com forwarded emails use a parser built from a sample. Anything it can\'t read goes to Needs review. Nothing is dropped.' },
  { item: 'New-lead and no-reply alerts by email', verdict: 'Can', truth: 'Email only. Make the sender a VIP on your phone so it actually gets your attention.' },
  { item: 'One-to-one email with opt-out enforcement', verdict: 'Can', truth: 'Needs a domain you control. Replies land in your normal inbox, not here.' },
  { item: 'Backup, full export and warnings when something breaks', verdict: 'Can', truth: 'Only if you set up the nightly backup and the outside watchdog. A backup counts once you have restored it.' },
  { item: 'Find relationships in your own past email and texts', verdict: 'Can', truth: 'Your own AI agent does this on your own computer. Only summaries and dates come here, and only for people you approve.' },
  { item: 'iMessage history', verdict: 'Can', truth: 'Mac only, from a read-only copy, after you grant Full Disk Access. Only what is on that Mac. Deleted messages won\'t appear. A web app alone can\'t read iMessage, and Windows has no route.' },
  { item: 'iPhone texts without a Mac', verdict: "Can't", truth: 'No supported way. Use your phone contacts export instead.' },
  { item: 'Google Voice and Android texts', verdict: 'Can', truth: 'From a Google Takeout export or an SMS backup file. No live connection.' },
  { item: 'Scheduled history sync', verdict: 'Can', truth: 'Runs on your computer only while it is on and signed in. Status warns you when it goes quiet.' },
  { item: 'Zillow leads, direct or two-way', verdict: "Can't", truth: 'Zillow only connects to CRMs on its approved list.' },
  { item: 'Texting from the CRM, calling and call recording', verdict: 'Later', truth: 'Needs Twilio, carrier registration and per-message costs. Not in this version.' },
  { item: 'Reading your personal phone\'s texts or calls live', verdict: "Can't", truth: 'A web app can\'t read them. Log what matters by hand.' },
  { item: 'Batch email and drips', verdict: 'Later', truth: 'Will ship capped, with consent gates. Imported contacts never qualify by default.' },
  { item: 'Assistant login', verdict: 'Later', truth: 'The first role to be added. Every row already records who created it.' },
  { item: 'MLS data and listings', verdict: 'Later', truth: 'MLS feeds cost money and differ by MLS. Use a link field for now.' },
  { item: 'IDX search on your site', verdict: "Won't", truth: 'Use your MLS\'s own IDX option. The form feeds this CRM.' },
  { item: 'Native phone app', verdict: "Won't", truth: 'Too much upkeep for one maintainer. The web app works on a phone browser.' },
  { item: 'Transaction file, e-signing, compliance review', verdict: "Won't", truth: 'Not your transaction file. Keep that in your firm\'s system.' },
  { item: 'Official brokerage record', verdict: "Can't", truth: 'Record keeping stays your responsibility and your firm\'s.' },
  { item: 'Automatic Do Not Call scrubbing', verdict: 'Later', truth: 'Needs a registry account or a paid vendor. It holds an opt-out flag and warns.' },
  { item: 'Legal compliance', verdict: "Can't", truth: 'It records consent and blocks known opt-outs. It can\'t judge whether a message is legal. Not legal advice.' },
  { item: 'Support, uptime or security guarantee', verdict: "Won't", truth: 'No support line and no promises. You run it. If Vercel, Supabase or Resend fail, so does this.' },
  { item: 'Lead routing and teams', verdict: "Won't", truth: 'One agent per install.' },
];
