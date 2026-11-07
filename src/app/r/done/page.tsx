// Fixed messages only. The code picks one of these; any other text in the URL is ignored.
const DONE: Record<string, string> = {
  replied: 'Marked as replied. The reminders for this lead have stopped.',
  signed_out: 'Every session has ended. Change your password next.',
  unsubscribed: 'You are unsubscribed. You will not get marketing email from this sender again.',
  bad_link: 'This link is not valid or has expired. Nothing was changed.',
  link_used: 'This link was already used. Each link works once. Nothing else was changed.',
};
export default async function Done({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const text = Object.prototype.hasOwnProperty.call(DONE, String(sp.code)) ? DONE[String(sp.code)] : DONE.bad_link;
  return <div className="public"><h1>Done</h1><p data-testid="done-message">{text}</p></div>;
}
