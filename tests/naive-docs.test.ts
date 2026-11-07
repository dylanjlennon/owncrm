// Beginner walkthrough ("Pat"): the doc steps where a non-technical agent got stuck.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_URL } from '@/lib/config';

const root = join(__dirname, '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const section = (text: string, from: string, to: string) => {
  const a = text.indexOf(from);
  expect(a, from).toBeGreaterThanOrEqual(0);
  const b = text.indexOf(to, a + from.length);
  return text.slice(a, b < 0 ? undefined : b);
};
const USER_DOCS = ['README.md', 'AGENTS.md', 'SETUP-WITH-CLAUDE.md', 'prompts/BUILD.md', 'prompts/RESCUE.md', 'USER-MAP.md', 'HOW-TO.md', 'FAQ.md', 'RESTORE.md', 'rescue/README.md', '.env.example'];

describe('6: the real download address, everywhere', () => {
  it('REPO_URL is the public repository', () => {
    expect(REPO_URL).toBe('https://github.com/dylanjlennon/owncrm');
  });
  it('no doc or code still has the placeholder', () => {
    for (const f of [...USER_DOCS, 'src/lib/config.ts', 'SPEC.md', 'CAPABILITIES.md']) expect([f, read(f).includes('YOUR-GITHUB-NAME')]).toEqual([f, false]);
  });
  it('README and AGENTS.md give the exact clone command', () => {
    for (const f of ['README.md', 'AGENTS.md']) expect(read(f)).toContain(`git clone ${REPO_URL}`);
  });
});

describe('1: Step 0 says how to get an agent that runs commands', () => {
  const step0 = section(read('README.md'), '## Step 0', '## Your own private copy');
  it('says a browser chat cannot do this', () => {
    expect(step0).toMatch(/in a browser can't open files or run programs on your computer/);
  });
  it('gives the Claude Code install line for Mac and Windows, and a check', () => {
    expect(step0).toContain('curl -fsSL https://claude.ai/install.sh | bash');
    expect(step0).toContain('irm https://claude.ai/install.ps1 | iex');
    expect(step0).toContain('claude --version');
    expect(step0).toMatch(/free plan doesn't include it/);
  });
  it('gives an OpenAI option (Codex) for Mac and Windows', () => {
    expect(step0).toContain('curl -fsSL https://chatgpt.com/codex/install.sh | sh');
    expect(step0).toContain('irm https://chatgpt.com/codex/install.ps1 | iex');
    expect(step0).toMatch(/Sign in with ChatGPT/);
  });
  it('the agent install comes before "open your agent", and says how to open Terminal', () => {
    expect(step0.indexOf('install.sh')).toBeLessThan(step0.indexOf('Open your AI agent in that folder'));
    expect(step0).toMatch(/Command and Space, type Terminal/);
    expect(step0).toMatch(/npm warn deprecated".*normal/);
  });
  it('AGENTS.md and SETUP say a browser chat cannot run commands', () => {
    expect(read('AGENTS.md')).toMatch(/browser chat \(ChatGPT, Claude\.ai\) can't run these commands/);
    expect(read('SETUP-WITH-CLAUDE.md')).toMatch(/a chat in your web browser can't do this/);
  });
});

describe('Node.js guidance is honest', () => {
  it('states the supported range and the LTS, and matches package.json', () => {
    const step0 = section(read('README.md'), '## Step 0', '## Your own private copy');
    expect(JSON.parse(read('package.json')).engines.node).toBe('>=22.13');
    expect(step0).toMatch(/Supported: Node\.js 22\.13 or newer\. Tested on 22 and 26/);
    expect(step0).toMatch(/LTS\*\* installer \(v26 in November 2026\)/);
    expect(step0).toMatch(/Node 22 gets security fixes only until April 2027/);
  });
});

describe('3: a no-terminal deploy that makes a private copy', () => {
  const readme = read('README.md');
  const button = readme.match(/\[!\[Deploy with Vercel\]\(https:\/\/vercel\.com\/button\)\]\((https:\/\/vercel\.com\/new\/clone\?[^\s]+)\)/);
  it('README has a Vercel Deploy button for this repository', () => {
    expect(button).not.toBeNull();
    const url = new URL(button![1]);
    expect(url.searchParams.get('repository-url')).toBe(REPO_URL);
    expect(url.searchParams.get('envDescription')).toMatch(/Never paste them into a chat/);
    expect(url.searchParams.get('envLink')).toBe(`${REPO_URL}/blob/main/prompts/BUILD.md#prompt-4-deploy-this-gives-the-app-its-address`);
  });
  it('the button asks for every setting the app requires to start, and BUILD.md says where each comes from', () => {
    const required = [...read('src/lib/env.ts').matchAll(/required\('([A-Z_]+)'\)/g)].map((m) => m[1]);
    const asked = new URL(button![1]).searchParams.get('env')!.split(',');
    for (const r of required) expect(asked).toContain(r);
    const p4 = section(read('prompts/BUILD.md'), '### Prompt 4: deploy (this gives the app its address)', '### Prompt 5');
    for (const k of asked) expect(p4).toContain(`| ${k} |`);
    expect(p4).toMatch(/Publishable key\*\* \(starts `sb_publishable_`\)/);
    expect(p4).toMatch(/Secret key\*\* \(starts `sb_secret_`/);
  });
  it('BUILD.md makes the button the main path, template second, git last, and checks Private', () => {
    const p4 = section(read('prompts/BUILD.md'), '### Prompt 4', '### Prompt 5');
    const main = p4.indexOf('**The main path: the Deploy button.**');
    const template = p4.indexOf('"Use this template"');
    const git = p4.indexOf('**Advanced (you know git):**');
    expect(main).toBeGreaterThan(0);
    expect(template).toBeGreaterThan(main);
    expect(git).toBeGreaterThan(template);
    expect(p4).toMatch(/it must say \*\*Private\*\*/);
    expect(p4).toMatch(/Redeploy/);
    expect(readme).toMatch(/"Use this template", then "Create a new repository", choose \*\*Private\*\*/);
  });
});

describe('4: BUILD Prompt 3 runs every migration', () => {
  const files = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  const p3 = section(read('prompts/BUILD.md'), '### Prompt 3: database', '### Prompt 4');
  it('tells the AI to run every file in name order', () => {
    expect(p3).toMatch(/run every file in supabase\/migrations in name order/);
    expect(p3).not.toMatch(/there are five/i);
  });
  it('the count and the first and last file match the folder', () => {
    expect(p3).toContain(`There are ${files.length} files in \`supabase/migrations\` today, from \`${files[0]}\` to \`${files.at(-1)}\``);
  });
  it('says NOTICE lines are normal and which signup switch to turn off', () => {
    expect(p3).toMatch(/NOTICE.*normal/);
    expect(p3).toMatch(/leave the Email provider itself ON/);
  });
});

describe('2: the email domain step is doable', () => {
  const p5 = section(read('prompts/BUILD.md'), '### Prompt 5', '### Prompt 6');
  it('names the common registrars and where to click', () => {
    for (const r of ['GoDaddy', 'Namecheap', 'Squarespace', 'Google Domains', 'Cloudflare']) expect(p5).toContain(r);
    expect(p5).toMatch(/Custom MX/);
    expect(p5).toMatch(/DNS only/);
  });
  it('has a filled-in records table', () => {
    expect(p5).toMatch(/\| MX \| `send\.mail` \|/);
    expect(p5).toMatch(/\| TXT \| `send\.mail` \| `v=spf1 include:amazonses\.com ~all` \|/);
    expect(p5).toMatch(/\| TXT \| `resend\._domainkey\.mail` \|/);
    expect(p5).toMatch(/receiving forwarded lead emails/);
  });
  it('says how to know it is verified and what to do after an hour', () => {
    expect(p5).toMatch(/domain says \*\*Verified\*\*/);
    expect(p5).toMatch(/\*\*Not verified after an hour\?\*\*/);
    expect(p5).toMatch(/nslookup -type=TXT/);
    expect(p5).toMatch(/72 hours/);
  });
});

describe('5: backups end to end', () => {
  const build = read('prompts/BUILD.md');
  const p3 = section(build, '### Prompt 3', '### Prompt 4');
  const p8 = section(build, '### Prompt 8', '### Prompt 9');
  it('the database password is saved when the project is made', () => {
    expect(p3).toMatch(/Database Password.*SAVE IT in my password manager/s);
  });
  it('says where the connection string is and that it needs that password', () => {
    expect(p8).toMatch(/\*\*Connect\*\* button at the top, \*\*Session pooler\*\*/);
    expect(p8).toMatch(/Replace `\[YOUR-PASSWORD\]`/);
    for (const s of ['SUPABASE_DB_URL', 'BACKUP_AGE_RECIPIENT', 'OWNCRM_URL', 'BACKUP_REPORT_SECRET', 'HEALTHCHECK_BACKUP_URL']) {
      expect(read('.github/workflows/backup.yml')).toContain(`secrets.${s}`);
      expect(p8).toContain(`| \`${s}\` |`);
    }
  });
  it('installs age on Mac and Windows', () => {
    expect(p8).toContain('brew install age');
    expect(p8).toContain('raw.githubusercontent.com/Homebrew/install/HEAD/install.sh');
    expect(p8).toContain('winget install FiloSottile.age');
  });
  it('makes the key in the home folder, never the repo folder', () => {
    expect(p8).toContain('age-keygen -o ~/crm-backup-key.txt');
    expect(p8).toContain('age-keygen -o $HOME\\crm-backup-key.txt');
    expect(p8).toMatch(/never inside the owncrm folder/i);
    expect(build).not.toMatch(/age-keygen -o crm-backup-key\.txt/);
  });
  it('names GitHub\'s Actions tab and Run workflow button', () => {
    expect(p8).toMatch(/\*\*Actions\*\* tab, \*\*nightly-backup\*\*.*\*\*Run workflow\*\*/);
  });
});

describe('RESCUE.md covers the sources and the review sheet', () => {
  const r = read('prompts/RESCUE.md');
  it('Android texts, Outlook and the Takeout wait', () => {
    expect(r).toContain('--source android_sms');
    expect(r).toMatch(/SMS Backup & Restore/);
    expect(r).toMatch(/\.pst on Windows, \.olm on Mac/);
    expect(r).toMatch(/Takeout emails me a download link/);
  });
  it('explains refusals, merge_with, Approve by hand and the block list', () => {
    expect(r).toMatch(/names the person, the field and the word/);
    expect(r).toMatch(/merge_with puts two people in one household/);
    expect(r).toMatch(/"Approve by hand" means/);
    expect(r).toMatch(/block list are never kept, even with a yes/);
  });
});

describe('plain style in user-facing docs', () => {
  it('no em dashes', () => {
    for (const f of USER_DOCS) expect([f, read(f).includes('—')]).toEqual([f, false]);
  });
});
