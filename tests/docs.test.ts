// Review fixes to the docs: Step 0, Node version, build order, honest privacy and cost wording,
// SPEC rules an app in another language can match, and the guides that were missing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_URL } from '@/lib/config';
import { CAPABILITIES } from '@/lib/capabilities';
import { PROTECTED, mentionsHealthOrLegal } from '../contract/lib/policy.mjs';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('blue #4: Step 0 and one Node version', () => {
  it('README and AGENTS.md have a Step 0 with the download address, Node 22.13+ and git for Mac and Windows', () => {
    for (const f of ['README.md', 'AGENTS.md']) {
      const t = read(f);
      expect(t).toMatch(/Step 0/);
      expect(t).toContain(REPO_URL);
      expect(t).toMatch(/22\.13/);
      expect(t).toMatch(/git/);
      expect(t).toMatch(/Windows/);
      expect(t).toMatch(/Mac/);
    }
  });
  it('package.json, the lockfile and the rescue README agree on Node 22.13+', () => {
    expect(JSON.parse(read('package.json')).engines.node).toBe('>=22.13');
    expect(JSON.parse(read('package-lock.json')).packages[''].engines.node).toBe('>=22.13');
    expect(read('rescue/README.md')).toMatch(/22\.13/);
  });
  it('AGENTS.md names the starting file', () => {
    expect(read('AGENTS.md')).toMatch(/Start at \[SETUP-WITH-CLAUDE\.md\]/);
  });
});

describe('blue #5: BUILD.md order', () => {
  it('deploys (and gets the app address) before anything that needs the address', () => {
    const b = read('prompts/BUILD.md');
    const deploy = b.indexOf('### Prompt 4: deploy');
    expect(deploy).toBeGreaterThan(0);
    expect(b.indexOf('/api/webhooks/resend')).toBeGreaterThan(deploy);
    expect(b.indexOf('HEALTHCHECK_PING_URL')).toBeGreaterThan(deploy);
    expect(b.indexOf('Copy .env.example to .env.local')).toBeGreaterThan(deploy);
    expect(b.slice(b.indexOf('### Prompt 1'), deploy)).not.toMatch(/\.env\.local/);
  });
  it('has the owner create the backup watchdog check and its secret', () => {
    const b = read('prompts/BUILD.md');
    expect(b).toMatch(/CRM backup/);
    expect(b).toMatch(/HEALTHCHECK_BACKUP_URL/);
  });
});

describe('blue #6: SPEC states the rules in plain language', () => {
  const spec = read('SPEC.md');
  it('lists every protected-trait word and the health and legal words the code refuses', () => {
    for (const w of PROTECTED) expect(spec).toContain(w);
    for (const w of ['chemo', 'biopsy', 'custody', 'bankruptcy', 'lawsuit', 'dementia']) expect(mentionsHealthOrLegal(w)).toBe(true);
    for (const w of ['chemo', 'biopsy', 'custody', 'bankrupt', 'lawsuit', 'dementia', 'standalone run of exactly 9 digits']) expect(spec).toContain(w);
  });
  it('states the merge rules and the upload wire format, and which rescue commands need this app', () => {
    expect(spec).toMatch(/### Merge rules/);
    expect(spec).toMatch(/stored as \*\*unknown\*\*/);
    expect(spec).toMatch(/POST \{APP_URL\}\/api\/history\/upload/);
    expect(spec).toMatch(/Bearer och_/);
    expect(spec).toMatch(/client_batch_id/);
    expect(spec).toMatch(/only if\*\* it implements this endpoint/);
    expect(read('contract/README.md')).toMatch(/SPEC\.md/);
  });
});

describe('public review: honest privacy and cost wording', () => {
  it('no doc says nothing leaves your computer', () => {
    for (const f of ['README.md', 'FAQ.md', 'prompts/RESCUE.md', 'docs/TWO-PHASES.md', 'CAPABILITIES.md', 'SECURITY.md']) {
      expect(read(f)).not.toMatch(/nothing (leaves|in this phase)|before your AI sees anything\. Family/i);
    }
  });
  it('RESCUE.md says the AI vendor sees what the AI reads, says to turn off training, and warns about connectors', () => {
    const r = read('prompts/RESCUE.md');
    expect(r).toMatch(/goes? to (that|your AI) company/);
    expect(r).toMatch(/turn off "use my data to train/i);
    expect(r).toMatch(/connector.*before any local cleaning/s);
    expect(r).toMatch(/real control/i);
  });
  it('FAQ: the software is free, running it is not', () => {
    const f = read('FAQ.md');
    expect(f).toMatch(/\*\*Is this free\?\*\* The software is free and open source \(AGPL-3\.0\)/);
    expect(f).toMatch(/\$45 to \$65 a month/);
    expect(f).toMatch(/plus an AI plan/);
  });
  it('the never-store list says what redaction does not catch', () => {
    for (const f of ['FAQ.md', 'SECURITY.md', 'CAPABILITIES.md', 'prompts/RESCUE.md']) {
      const t = read(f);
      for (const w of ['passport', 'pre-approval', 'tax forms']) expect([f, t.includes(w)]).toEqual([f, true]);
    }
  });
});

describe('honesty fixes', () => {
  it('HOW-TO no longer promises a frame that the headers refuse', () => {
    const h = read('HOW-TO.md');
    expect(h).not.toMatch(/show it in a frame if your site allows/);
    expect(h).toMatch(/LEAD_FORM_FRAME_ANCESTORS/);
  });
  it('USER-MAP says 5 to 10 minutes', () => {
    expect(read('USER-MAP.md')).toMatch(/5 to 10 minutes/);
  });
  it('the main capabilities rows say they were tested on fake files only', () => {
    for (const item of ['iMessage history', 'Google Voice and Android texts', 'Find relationships in your own past email and texts', 'Website leads, forwarded lead emails and CSV files']) {
      expect(CAPABILITIES.find((c) => c.item === item)?.truth).toMatch(/tested on fake files only/i);
    }
  });
  it('HOW-TO explains each red check and how to replace a leaked key', () => {
    const h = read('HOW-TO.md');
    expect(h).toMatch(/## What each red check means/);
    expect(h).toMatch(/## Replace a leaked key/);
    for (const label of ['Scheduled job', 'Nightly backup', 'Logged-out read test', 'Outside watchdog check-in', 'Email allowance']) expect(h).toContain(`| ${label} |`);
  });
  it('SECURITY says the human review is the real control and documents the unsubscribe token exception', () => {
    const s = read('SECURITY.md');
    expect(s).toMatch(/real control/);
    expect(s).toMatch(/One-click unsubscribe carries its token in the address/);
  });
});
