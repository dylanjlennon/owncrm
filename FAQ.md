# Questions

**Is this free?** No. A safe setup costs about $45 to $65 a month. Free plans aren't safe for a business: Vercel's free plan is non-commercial, and Supabase's free plan has no backups and pauses.

**Is it a Follow Up Boss replacement?** No. It has no texting, calling, Zillow sync, team features or support line. You get ownership: the data, the code and the backups are yours.

**Who looks after it?** You. You are the IT department. The Status page, the red bar, the watchdog email and the daily all-clear tell you when something needs you.

**What if I lose my phone?** See RECOVERY in SETUP-WITH-CLAUDE.md. Save your authenticator setup key in your password manager on day one.

**Can my assistant log in?** Not in this version. One login per install. An assistant role is the first thing planned.

**Does it work with Zillow?** Not directly. Zillow only connects to CRMs on its approved list.

**Does it read my texts?** Not by itself. A web app can't read your phone. If you have a Mac, your own AI agent can read a copy of your iMessage history on that Mac, during "Connect your history", and only summaries and dates come into the CRM. There is no route for iMessage on Windows, or for iPhone texts without a Mac.

**Will my AI see my clients' private details?** The rescue tools remove account numbers, card numbers, Social Security numbers, passwords, license numbers and wire details before your AI sees anything, and leave family, friends, medical and legal threads out. Your AI runs under your own account and its terms apply. Read your firm's policy first. The people you message didn't agree to AI processing.

**Does the CRM store my AI login?** Never. There is an optional AI API key setting for future server features. It is off by default and encrypted. Never put a Claude.ai or ChatGPT subscription login anywhere in this app.

**Can I email my whole list?** Not in this version. One-to-one email only. Imported people have unknown consent and can't get marketing email until you record their consent.

**Someone asked me to stop emailing them.** Open their contact, Record consent, choose "Asked to stop". Their address goes on the opt-out list for good, and the database refuses every send to it.

**Is this my official transaction record?** No. Keep transaction files in your firm's system. NC requires brokers to keep records, and that stays your responsibility and your firm's.

**Is this legal advice?** No. It records consent and blocks known opt-outs. It can't tell you whether a message or a use of data is allowed.

**What if a forwarded lead email changes format?** It lands in Needs review and you get an email. Nothing is lost. The Realtor.com reader was built from a sample; check it against a real lead email after setup.

**What happens if Vercel, Supabase or Resend has an outage?** The CRM goes down with it. The outside watchdog emails you. Leads sent to your form during an outage are lost, so also have your form email you a copy.
