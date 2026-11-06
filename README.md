# OwnCRM

A small CRM for one real estate agent, that the agent owns: the database, the code and the backups. It keeps your contacts, follow-ups and deal dates, catches leads from your website and forwarded lead emails, tells you when a lead is waiting, and shouts when something breaks.

It can also rescue your relationships from your own history. Your own AI agent reads your past email and texts on your own computer, finds the people you have real estate relationships with, and you approve each one before it is saved. Only summaries and dates come into the CRM. Your messages stay on your computer.

**This is not a Follow Up Boss replacement.** It is ownership and control, not savings.

## Who should NOT use this

- **You buy Zillow leads.** Zillow Premier Agent buyer leads don't flow in directly. Zillow only connects to CRMs on its approved list.
- **You run a team, route leads, or need an assistant login.** There is one login per install.
- **You rely on texting from your CRM.** There is no texting, calling or call recording.
- **You don't want to own a system.** You are the IT department. Nobody else watches it. There is no support line and no response promise.

## What it really costs

| Part | Safe setup | Free plan catch |
|---|---|---|
| Vercel (runs the app) | Pro, $20 a month | Hobby is for non-commercial use under Vercel's own terms. A CRM you earn commissions with is commercial. Hobby scheduled jobs run only once a day, too slow for lead alerts. |
| Supabase (the database) | Pro, $25 a month | Free has no automatic backups and pauses idle projects. A paused database means lost leads. |
| Resend (email) | $0 to $20 a month | Free allows 100 emails a day and 3,000 a month, shared by alerts and client email. |
| Healthchecks.io (outside watchdog) | $0 | Free plan covers this app. |
| GitHub (code and nightly encrypted backup) | $0 | Use a private repository. |
| A domain you control | About $1 to $2 a month | Needed to send email. A Gmail address or a brokerage domain without DNS access won't work. |

**About $45 to $65 a month** for a setup you can rely on. Prices are from each provider's pricing page in November 2026. Check them before you start.

## What it can and can't do

The full list, with Can, Later, Can't and Won't, is in [CAPABILITIES.md](CAPABILITIES.md) and in the app. The short version:

- **Can:** contacts, households, timeline, follow-ups and a Today list; web form leads with the exact consent wording stored; forwarded Realtor.com lead emails with a Needs review queue where nothing is dropped; CSV import with preview, error file and one-click undo; new-lead and no-reply alerts; one-to-one email with opt-outs enforced by the database; deals with key dates and reminders; a Status page, a red banner, an outside watchdog, a weekly fake lead and a logged-out read test; full export; nightly encrypted backup with a tested restore; rescuing relationships from your own email and texts with your own AI.
- **Can't:** Zillow direct, reading texts on your phone, iMessage without a Mac, being your firm's official record, judging whether a message is legal.
- **Later:** texting, batch email and drips, an assistant login, MLS data.
- **Won't:** a native phone app, a transaction file, lead routing, guarantees.

## How it is built

Two phases that share one data shape, and work with any AI coding agent (Claude Code, Codex, Cursor, Gemini CLI and others):

1. **Rescue** (`prompts/RESCUE.md`, `/rescue`): your agent runs local tools on your computer, then writes a checked folder of people, summaries and dates. It works without the app, so you can rescue first and decide later.
2. **Build** (`prompts/BUILD.md`): your agent sets up this app (Supabase, Vercel, Resend, two-step sign-in, go-live checks) and imports the folder. Or it builds its own from [SPEC.md](SPEC.md), as long as it accepts the same folder.

The data shape lives in [`/contract`](contract/README.md). Read [docs/TWO-PHASES.md](docs/TWO-PHASES.md) for the plain version.

## Start here

1. Read this page and [CAPABILITIES.md](CAPABILITIES.md). Read your firm's independent contractor agreement and ask your broker-in-charge.
2. Open your AI agent in this folder and follow [SETUP-WITH-CLAUDE.md](SETUP-WITH-CLAUDE.md). It is a list of prompts to paste one after another. Any agent works; the file name is just where people look first.
3. Guides: [USER-MAP.md](USER-MAP.md) (where things are), [HOW-TO.md](HOW-TO.md), [FAQ.md](FAQ.md), [RESTORE.md](RESTORE.md), [SECURITY.md](SECURITY.md).

## Screens

Demo data only. Every name, email and phone is fake. The red bar in some screenshots is real: the test project has public signup turned on, and the app reports it.

![Today](docs/screens/08-today.png)
![Status](docs/screens/09-status.png)
![Connect your history](docs/screens/11-connect-history.png)

## For developers

- `npm run gate` runs typecheck, lint, unit tests (app, contract, rescue), build, a secret and client-data scan, the access test on a blank local Postgres with every migration replayed, a backup and restore-to-blank test, and real HTTPS access checks against a test project when `.env.local` exists.
- `npm run e2e` clicks through the main flows in a real browser against a test project. Email goes to a local file.
- Migrations: `supabase/migrations`. Access test: `supabase/tests/rls.sql`. Agent rules: [AGENTS.md](AGENTS.md).
- Rename the product in one place: `APP_NAME` in `src/lib/config.ts`.

## License, warranty, support

AGPL-3.0, copyright Dylan Lennon. See [LICENSE](LICENSE) and [NOTICE](NOTICE). No warranty. Not legal advice. Support is best effort through GitHub issues, with no response promise. If you run a changed version for other people, the AGPL asks you to offer them the source.
