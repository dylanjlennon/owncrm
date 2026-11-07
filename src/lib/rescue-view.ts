// What the owner sees about a rescue folder: the check before import, and the rescued summary on
// a contact. Kept apart from the pages so it can be tested.

type Row = Record<string, unknown>;
export type ContractPayload = { households?: Row[]; people?: Row[]; contact_methods?: Row[]; interactions?: Row[]; suppressions?: Row[]; deals?: Row[] };

const n = (rows: Row[] | undefined) => (rows ?? []).length;
const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/**
 * The sentence shown after "Check folder". Summaries live on each household (they become the
 * contact's notes), so they are counted there, apart from timeline items.
 */
export function contractCheckSentence(p: ContractPayload): string {
  const summaries = (p.households ?? []).filter((h) => typeof h.summary === 'string' && h.summary.trim() !== '').length;
  return `The folder passed the check: ${plural(n(p.households), 'household', 'households')}, ${plural(n(p.people), 'person', 'people')}, `
    + `${n(p.contact_methods)} emails and phones, ${plural(summaries, 'summary', 'summaries')} from your rescue (each shows at the top of that contact), `
    + `${plural(n(p.deals), 'closed deal', 'closed deals')}, ${plural(n(p.interactions), 'timeline item', 'timeline items')}, ${plural(n(p.suppressions), 'opt-out', 'opt-outs')}.`;
}

/** Import kinds that come from the rescue tools (a folder uploaded on Import, or a history batch). */
export const RESCUE_IMPORT_KINDS = ['contract', 'history'] as const;

/**
 * The note shown at the top of a contact page. A summary from a rescue is labelled as such, so
 * the owner can see the rescue kept it. Anything else in Notes is shown as "Notes".
 */
export function contactNote(notes: string | null | undefined, importKind: string | null | undefined): { title: string; text: string } | null {
  const text = (notes ?? '').trim();
  if (!text) return null;
  const fromRescue = (RESCUE_IMPORT_KINDS as readonly string[]).includes(importKind ?? '');
  return { title: fromRescue ? 'From your rescue' : 'Notes', text };
}
