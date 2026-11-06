// Every email goes through an adapter. Tests and demos use the mock. Nothing calls
// a provider directly, so swapping providers touches one file.
export type OutgoingEmail = {
  from: string; to: string; replyTo?: string | null; subject: string; text: string;
  headers?: Record<string, string>; idempotencyKey: string;
};
export type SendResult = { ok: true; providerId: string } | { ok: false; error: string };
export type ReceivedEmail = { from: string | null; to: string | null; subject: string | null; text: string; html: string | null };

export interface EmailAdapter {
  readonly name: string;
  send(msg: OutgoingEmail): Promise<SendResult>;
  getReceived(id: string): Promise<ReceivedEmail | null>;
  domainVerified(domain: string): Promise<boolean | null>;
}
