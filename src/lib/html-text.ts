// Turns email HTML into plain text for reading only. Email HTML is never rendered in the app.
//
// Review round 4, M3: the old tag strip (a "<", then anything but ">") retried from every "<" when no ">" followed,
// so an email of 200,000 "<" took about 15 seconds. The text is now cut first, and the tag rule
// can't run past the next "<", so each character is read a fixed number of times.
export const HTML_TEXT_MAX = 200_000;
// One tag: "<" then anything but "<" or ">", then ">". Linear: it never reads past the next "<".
export const TAG_RE = /<[^<>]*>/g;

/** Plain text from email HTML. Cut to `max` characters before any rule runs. */
export function htmlToText(html: string | null | undefined, max = HTML_TEXT_MAX): string {
  return String(html ?? '').slice(0, max)
    .replace(/<br[^<>]{0,20}>/gi, '\n')
    .replace(/<\/(?:p|div|tr)>/gi, '\n')
    .replace(TAG_RE, ' ');
}

/**
 * The address a From header names: the one in angle brackets at the end ("Name" <a@b.example.com>), or the
 * whole header when it is a bare address. Null for anything else, so an address typed into the
 * display name ("leads@zillow.com" <x@junk.example.com>) is never taken for the sender. The header is
 * cut to 1,000 characters first, and neither rule can run past the next "<".
 */
export function fromAddress(from: string | null | undefined): string | null {
  const h = String(from ?? '').slice(0, 1000).trim();
  const m = h.match(/<([^<>\s"@]+@[^<>\s"@]+)>$/) ?? h.match(/^([^<>\s"@]+@[^<>\s"@]+)$/);
  return m ? m[1].toLowerCase().replace(/\.+$/, '') : null;
}

/** The sender, for per-sender limits and the "needs review" email: the From address, or the first
 * address-like word in an odd header, or "unknown". A match only starts at the start of a word,
 * so a long header with no "@" is read once. */
export function senderAddress(from: string | null | undefined): string {
  return fromAddress(from) ?? String(from ?? '').slice(0, 1000).match(/(?<![^\s<>"])[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase() ?? 'unknown';
}
