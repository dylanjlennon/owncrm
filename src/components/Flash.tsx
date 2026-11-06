import { messageFor } from '@/lib/messages';

// Shows a message only if the code is on the fixed list. Unknown text is ignored.
export function Flash({ code }: { code: unknown }) {
  const m = messageFor(code);
  if (!m) return null;
  return <div role="status" className={`flash ${m.tone}`}>{m.text}</div>;
}
