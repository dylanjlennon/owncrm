# OwnCRM

A small CRM for one real estate agent, that the agent owns: the database, the code and the backups. It keeps your contacts, follow-ups and deal dates, catches leads from your website and forwarded lead emails, tells you when a lead is waiting, and shouts when something breaks.

It can also rescue your relationships from your own history. Plain programs on your computer read your exports and strip out account, card, Social Security and license numbers and wire details. Then your own AI agent reads short, cleaned snippets and suggests who is a real estate relationship. That step goes through your AI company's servers under your own account, so turn off training on your data and check your firm's AI policy first. You approve every person. Only summaries and dates come into the CRM. Your export files stay on your computer.

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

**About $45 to $65 a month** for a setup you can rely on, plus an AI plan (about $20 a month) if you don't already pay for one. The software itself is free (AGPL-3.0). Prices are from each provider's pricing page in November 2026. Check them before you start.

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

## Step 0: get the download and the tools

Do this once, before any prompt. It takes about 20 minutes.

1. **Install Node.js 22.13 or newer.** Go to nodejs.org and download the LTS installer (22 or newer).
   - Mac: open the downloaded .pkg and click through.
   - Windows: open the downloaded .msi and click through. Leave "Add to PATH" ticked.
   - Check it worked: open Terminal (Mac) or PowerShell (Windows) and type `node -v`. It should say v22.13 or higher.
2. **Install git.**
   - Mac: in Terminal type `git --version`. If it isn't there, macOS offers to install the developer tools. Say yes.
   - Windows: download "Git for Windows" from git-scm.com and click through with the default choices.
3. **Get the download.** In Terminal or PowerShell:
   ```
   git clone https://github.com/YOUR-GITHUB-NAME/owncrm
   cd owncrm
   npm install
   ```
   (The address is a placeholder until the public repository is published. Use the address you were given.)
   No git? On the repository page, press Code, Download ZIP, unzip it, and open that folder instead.
4. **Open your AI agent in that folder.** Claude Code: type `claude` in the same Terminal window. Codex, Cursor or Gemini CLI: open the `owncrm` folder in it. Then go to "Start here" below.

Windows notes: iMessage rescue needs a Mac. The backup key tool (`age`) and the restore tool (`psql`) aren't built in. Your agent can install them with `winget install FiloSottile.age` and `winget install PostgreSQL.PostgreSQL`. Use `node -e` instead of `openssl` for random secrets (BUILD.md shows how). Paths look like `C:\Users\you\owncrm-rescue` instead of `~/owncrm-rescue`.

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
