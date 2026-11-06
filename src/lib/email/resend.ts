import type { EmailAdapter, OutgoingEmail, ReceivedEmail, SendResult } from './adapter';

// Talks to Resend over plain HTTPS. Not run by tests: a real account is needed to test it.
const API = 'https://api.resend.com';

export class ResendAdapter implements EmailAdapter {
  readonly name = 'resend';
  constructor(private apiKey: string, private fetcher: typeof fetch = fetch) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...extra };
  }

  async send(msg: OutgoingEmail): Promise<SendResult> {
    try {
      const res = await this.fetcher(`${API}/emails`, {
        method: 'POST',
        headers: this.headers({ 'Idempotency-Key': msg.idempotencyKey }),
        body: JSON.stringify({ from: msg.from, to: [msg.to], reply_to: msg.replyTo || undefined, subject: msg.subject, text: msg.text, headers: msg.headers }),
        signal: AbortSignal.timeout(10000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) return { ok: false, error: String(data.message || `HTTP ${res.status}`).slice(0, 300) };
      return { ok: true, providerId: data.id };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e).slice(0, 300) };
    }
  }

  async getReceived(id: string): Promise<ReceivedEmail | null> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;
    try {
      const res = await this.fetcher(`${API}/emails/receiving/${id}`, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const d: any = await res.json();
      return { from: d.from ?? null, to: Array.isArray(d.to) ? d.to.join(', ') : d.to ?? null, subject: d.subject ?? null, text: d.text ?? '', html: d.html ?? null };
    } catch { return null; }
  }

  async domainVerified(domain: string): Promise<boolean | null> {
    try {
      const res = await this.fetcher(`${API}/domains`, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const d: any = await res.json();
      const hit = (d.data || []).find((x: any) => String(x.name).toLowerCase() === domain.toLowerCase());
      return hit ? hit.status === 'verified' : false;
    } catch { return null; }
  }
}
