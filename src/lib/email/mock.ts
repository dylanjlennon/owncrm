import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EmailAdapter, OutgoingEmail, ReceivedEmail, SendResult } from './adapter';

// Writes emails to a local file instead of sending them. For tests and demos only.
export class MockAdapter implements EmailAdapter {
  readonly name = 'mock';
  sent: OutgoingEmail[] = [];
  received = new Map<string, ReceivedEmail>();
  constructor(private logFile?: string) {}
  async send(msg: OutgoingEmail): Promise<SendResult> {
    this.sent.push(msg);
    const providerId = `mock_${randomUUID()}`;
    if (this.logFile) appendFileSync(this.logFile, JSON.stringify({ providerId, at: new Date().toISOString(), ...msg }) + '\n');
    if (msg.to.toLowerCase().startsWith('reject@')) return { ok: false, error: 'Mock provider refused this address' };
    return { ok: true, providerId };
  }
  async getReceived(id: string) {
    if (this.received.has(id)) return this.received.get(id)!;
    // Tests drop a fake received email at MOCK_INBOUND_DIR/<id>.json.
    const dir = process.env.MOCK_INBOUND_DIR;
    if (dir && /^[A-Za-z0-9_-]+$/.test(id) && existsSync(join(dir, `${id}.json`))) return JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as ReceivedEmail;
    return null;
  }
  async domainVerified() { return true; }
}

// Used when no provider is set up. Every send fails loudly, so nothing pretends to work.
export class OffAdapter implements EmailAdapter {
  readonly name = 'off';
  async send(): Promise<SendResult> { return { ok: false, error: 'Email is not set up yet. Add RESEND_API_KEY.' }; }
  async getReceived() { return null; }
  async domainVerified() { return null; }
}
