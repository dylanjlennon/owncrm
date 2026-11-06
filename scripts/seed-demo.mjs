#!/usr/bin/env node
// Demo data: about 40 fake households for a demo or screenshots.
// Every name says Example, Sample, Demo, Testerson or Placeholder, every email is @example.com,
// every phone is 555-01xx. Use it on a TEST project only, with DEMO_MODE=true in the app.
//   node scripts/seed-demo.mjs            writes supabase/seed-demo.sql for the SQL editor
//   imported by e2e/run.mjs               inserts the same rows through the API as the owner
import { writeFileSync } from 'node:fs';

const FIRST = ['Avery','Blake','Casey','Dana','Emery','Finley','Gray','Harper','Indy','Jules','Kai','Logan','Morgan','Noel','Oakley','Parker','Quinn','Reese','Sage','Tatum'];
const LAST = ['Example','Sample','Demo','Testerson','Placeholder'];
const STAGES = ['new lead','active buyer','active seller','past client','sphere','nurture','cold lead','past client','sphere','nurture'];
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

export function demoRows() {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(Math.floor(i / FIRST.length) + i) % LAST.length];
    const source = ['Open house', 'Referral from a past client', 'Website form', 'Realtor.com', 'Sphere'][i % 5];
    const sourceType = source === 'Realtor.com' ? 'portal' : i % 9 === 0 ? 'firm_provided' : 'personal';
    rows.push({
      household: { display_name: `${first} ${last}`, stage: STAGES[i % STAGES.length], lead_source: source, source_type: sourceType,
        first_contact_on: iso(-(300 - i)), last_contact_on: i % 4 === 0 ? null : iso(-((i * 13) % 200)) },
      person: { first_name: first, last_name: last },
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      phone: `828-555-01${String(i).padStart(2, '0')}`,
      consent: { status: i % 3 === 0 ? 'opted_in' : 'unknown', source: i % 3 === 0 ? 'Website form, demo' : source, source_type: sourceType,
        wording: i % 3 === 0 ? 'Yes, you may email me market updates and listings. I can unsubscribe at any time.' : null },
      task: i % 2 === 0 ? { title: ['Call back about the showing', 'Send three listings', 'Check in after closing', 'Ask about their timeline'][i % 4], due_on: iso((i % 7) - 3) } : null,
      deal: i % 5 === 1 ? { side: i % 2 ? 'buyer' : 'seller', status: i % 10 === 1 ? 'under contract' : 'active', property_street: `${100 + i} Example Lane`, closing_date: iso(i % 10 === 1 ? 2 : 30 + i), net_to_me: i % 3 ? 9000 + i * 10 : null } : null,
      lead: i % 6 === 0 ? { channel: 'form', source, source_type: sourceType, minutesAgo: 20 + i } : null,
      interaction: { kind: ['call', 'email', 'showing', 'note'][i % 4], summary: ['Talked about timing for spring', 'Sent a market update', 'Toured two homes', 'Prefers texts after 5pm'][i % 4], daysAgo: (i * 13) % 200 },
    });
  }
  return rows;
}

// Inserts the demo through the API as the logged-in owner (used by the end-to-end test).
export async function seedThroughApi(db) {
  for (const r of demoRows()) {
    const { data: h, error } = await db.from('households').insert(r.household).select('id').single();
    if (error) throw new Error(error.message);
    const { data: p } = await db.from('people').insert({ ...r.person, household_id: h.id }).select('id').single();
    await db.from('contact_methods').insert([{ household_id: h.id, person_id: p.id, kind: 'email', value: r.email, is_primary: true }, { household_id: h.id, person_id: p.id, kind: 'phone', value: r.phone, is_primary: true }]);
    await db.from('consent_records').insert({ ...r.consent, household_id: h.id, person_id: p.id });
    if (r.task) await db.from('tasks').insert({ ...r.task, household_id: h.id });
    if (r.deal) await db.from('deals').insert({ ...r.deal, household_id: h.id });
    if (r.lead) await db.from('leads').insert({ household_id: h.id, channel: r.lead.channel, source: r.lead.source, source_type: r.lead.source_type, received_at: new Date(Date.now() - r.lead.minutesAgo * 60000).toISOString(), new_alert_at: new Date().toISOString() });
    await db.from('interactions').insert({ household_id: h.id, kind: r.interaction.kind, summary: r.interaction.summary, occurred_at: new Date(Date.now() - r.interaction.daysAgo * 86400000).toISOString() });
  }
  await db.from('suppressions').upsert({ kind: 'email', value: 'avery.example0@example.com', reason: 'demo opt-out' }, { onConflict: 'kind,normalized', ignoreDuplicates: true });
  await db.from('inbound_emails').upsert({ provider_id: 'demo-review-1', from_address: 'leads@example.com', subject: 'New lead (format changed)', text_body: 'Lead: Demo Person / contact: demo-person at example dot com', status: 'needs_review', review_reason: 'Could not find an email or phone. The template may have changed.' }, { onConflict: 'provider_id', ignoreDuplicates: true });
}

function sql() {
  const q = (s) => (s === null || s === undefined ? 'null' : typeof s === 'number' ? String(s) : `'${String(s).replace(/'/g, "''")}'`);
  const out = ['-- Demo data. Fake people only. Generated by scripts/seed-demo.mjs.', 'begin;'];
  for (const r of demoRows()) {
    const H = r.household;
    out.push(`with h as (insert into public.households (display_name, stage, lead_source, source_type, first_contact_on, last_contact_on) values (${[H.display_name, H.stage, H.lead_source, H.source_type, H.first_contact_on, H.last_contact_on].map(q).join(', ')}) returning id),
p as (insert into public.people (household_id, first_name, last_name) select id, ${q(r.person.first_name)}, ${q(r.person.last_name)} from h returning id, household_id),
m as (insert into public.contact_methods (household_id, person_id, kind, value, is_primary) select household_id, id, 'email', ${q(r.email)}, true from p union all select household_id, id, 'phone', ${q(r.phone)}, true from p returning 1),
c as (insert into public.consent_records (household_id, person_id, status, source, source_type, wording) select household_id, id, ${q(r.consent.status)}, ${q(r.consent.source)}, ${q(r.consent.source_type)}, ${q(r.consent.wording)} from p returning 1)
${r.task ? `, t as (insert into public.tasks (household_id, title, due_on) select id, ${q(r.task.title)}, ${q(r.task.due_on)} from h returning 1)` : ''}
${r.deal ? `, d as (insert into public.deals (household_id, side, status, property_street, closing_date, net_to_me) select id, ${[r.deal.side, r.deal.status, r.deal.property_street, r.deal.closing_date, r.deal.net_to_me].map(q).join(', ')} from h returning 1)` : ''}
${r.lead ? `, l as (insert into public.leads (household_id, channel, source, source_type, received_at, new_alert_at) select id, ${q(r.lead.channel)}, ${q(r.lead.source)}, ${q(r.lead.source_type)}, now() - interval '${r.lead.minutesAgo} minutes', now() from h returning 1)` : ''}
, n as (insert into public.interactions (household_id, kind, summary, occurred_at) select id, ${q(r.interaction.kind)}, ${q(r.interaction.summary)}, now() - interval '${r.interaction.daysAgo} days' from h returning 1)
select 1;`);
  }
  out.push(`insert into public.suppressions (kind, value, reason) values ('email', 'avery.example0@example.com', 'demo opt-out') on conflict do nothing;`);
  out.push(`insert into public.inbound_emails (provider_id, from_address, subject, text_body, status, review_reason) values ('demo-review-1', 'leads@example.com', 'New lead (format changed)', 'Lead: Demo Person / contact: demo-person at example dot com', 'needs_review', 'Could not find an email or phone. The template may have changed.') on conflict do nothing;`);
  out.push('commit;');
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync('supabase/seed-demo.sql', sql());
  console.log('Wrote supabase/seed-demo.sql (40 fake households).');
}
