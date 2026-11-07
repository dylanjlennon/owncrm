// Beginner walkthrough, fix 7: the import check said "0 summaries" for a folder with 10, and the
// summaries were only inside the Notes edit box, so the owner thought the rescue lost them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contractCheckSentence, contactNote } from '@/lib/rescue-view';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('the rescue folder check counts summaries', () => {
  const households = Array.from({ length: 10 }, (_, i) => ({ household_id: `h-${i}`, summary: i < 10 ? `Bought a home in 2024 (${i})` : '' }));
  it('says 10 summaries when 10 households have one and there are no timeline items', () => {
    const s = contractCheckSentence({ households, people: Array(11).fill({}), contact_methods: Array(21).fill({}), interactions: [], suppressions: [], deals: Array(3).fill({}) });
    expect(s).toContain('10 households, 11 people, 21 emails and phones, 10 summaries from your rescue');
    expect(s).toContain('3 closed deals, 0 timeline items, 0 opt-outs');
    expect(s).not.toMatch(/\b0 summaries/);
  });
  it('does not count empty summaries', () => {
    expect(contractCheckSentence({ households: [{ summary: '' }, { summary: '  ' }, { summary: 'Sold in 2023' }] })).toContain('1 summary from your rescue');
  });
  it('the import page uses it', () => {
    const page = read('src/app/(app)/import/[id]/page.tsx');
    expect(page).toContain('contractCheckSentence(payload)');
    expect(page).not.toMatch(/interactions\.length\} summaries/);
  });
});

describe('a rescued summary shows at the top of the contact', () => {
  it('labels a summary from a rescue folder or a history batch', () => {
    expect(contactNote('Bought 12 Example Ave in 2024', 'contract')).toEqual({ title: 'From your rescue', text: 'Bought 12 Example Ave in 2024' });
    expect(contactNote('Bought 12 Example Ave in 2024', 'history')?.title).toBe('From your rescue');
    expect(contactNote('Met at an open house', 'csv')?.title).toBe('Notes');
    expect(contactNote('Met at an open house', null)?.title).toBe('Notes');
    expect(contactNote('   ', 'contract')).toBeNull();
  });
  it('the contact page shows it above the details, and the empty timeline points to it', () => {
    const page = read('src/app/(app)/contacts/[id]/page.tsx');
    expect(page).toContain('data-testid="contact-note"');
    expect(page.indexOf('data-testid="contact-note"')).toBeLessThan(page.indexOf('<dl className="kv">'));
    expect(page).toContain('Your rescue summary is at the top of this page.');
  });
});
