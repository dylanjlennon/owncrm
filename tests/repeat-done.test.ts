// Review round 2, N7: pressing Done twice on a repeating follow-up must not add two repeats.
import { describe, it, expect, vi } from 'vitest';
import { fakeDb } from './fakedb';

const TASK = '11111111-1111-4111-8111-111111111111';
const db = fakeDb({
  tables: { tasks: [{ id: TASK, household_id: 'h1', title: 'Check in', due_on: '2026-11-01', repeat_days: 30, done_at: null }], app_settings: [{ id: true, timezone: 'UTC' }] },
  defaults: { tasks: () => ({ done_at: null }) },
});
vi.mock('@/lib/auth', () => ({ requireOwner: async () => ({ db }) }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/settings', () => ({ getSettings: async () => ({ timezone: 'UTC' }) }));
const { markDone } = await import('@/app/(app)/contacts/actions');

describe('N7: Done on a repeating follow-up', () => {
  it('three presses (double click, Back and resubmit) leave exactly one next follow-up', async () => {
    const form = () => { const x = new FormData(); x.set('id', TASK); x.set('back', '/today'); return x; };
    for (let i = 0; i < 3; i++) await markDone(form()).catch((e) => e);
    const open = db.tables.tasks.filter((t: any) => !t.done_at);
    expect(open).toHaveLength(1);
    expect(open[0].repeat_days).toBe(30);
    expect(db.tables.tasks.filter((t: any) => t.done_at)).toHaveLength(1);
  });
});
