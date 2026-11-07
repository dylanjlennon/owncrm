# Set up with your AI agent

You don't need to code. You need about two evenings, a credit card for the services, and your phone for two-step sign-in. First do "Step 0" in README.md: install Node.js 22.13 or newer and git, get the download, and run `npm install`. Then open your AI agent (Claude Code, Claude Desktop, Codex, Cursor, Gemini CLI or another) in this folder, then paste these prompts one after another. Each one finishes before you paste the next.

Your agent uses your own account. Nothing here asks for your AI login, and you should never give it to any app.

**Rule for the whole setup:** never paste a password, a secret key or a token into the chat. When a key is needed, your agent tells you where to put it.

---

**1. Is this right for me?**
```
Read AGENTS.md, README.md and CAPABILITIES.md. In plain words, tell me who should not use this, what it costs per month,
and what it can't do. Ask me if I buy Zillow leads, run a team, have an assistant who needs a login, or rely on texting.
If yes to any, tell me to stop.
```

**2. Rescue my relationships first (optional, no app needed)**
```
Follow prompts/RESCUE.md with me, one prompt at a time. Read its notes on what leaves my computer to me first.
Stop after the contract folder passes the check.
```

**3. Build the app**
```
Follow prompts/BUILD.md with me, one prompt at a time, from Prompt 2. Stop and wait for me at every step that needs
me to sign up, pay, click in a dashboard or scan a code.
```

**4. Import what I rescued**
```
Follow Prompt 10 in prompts/BUILD.md.
```

**5. Practice a restore**
```
Follow RESTORE.md with me into an empty test project. Show me the counts match.
```

**6. Monthly check-up (put this on your calendar)**
```
Read HOW-TO.md, section "Monthly check-up". Check for security updates to Next.js and the other packages,
run npm audit and npm run gate, show me what changed, and update only if the gate passes. Then open my Status page
with me and explain anything that isn't green.
```

---

## RECOVERY: if you are locked out

- **Lost your phone or authenticator app:** use the setup key you saved in your password manager to add the code to a new authenticator app. If you didn't save it: in Supabase, Authentication, Users, open your user and remove the authenticator factor. Sign in with your password and set up a new one right away.
- **Forgot your password:** in Supabase, Authentication, Users, use "Send password recovery", or set a new password there.
- **Got a "New sign-in" email you don't recognize:** press the "wasn't me" link in it. Every session ends. Then change your password in Supabase and check Supabase, Authentication, Users for factors you didn't add.
- **Lost the Supabase login too:** use Supabase's own account recovery. Nobody connected to this project can get you back in.
- **A key leaked** (pasted into a chat, a screenshot, a public repository): see "Replace a leaked key" in HOW-TO.md.
