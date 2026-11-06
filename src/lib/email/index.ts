import 'server-only';
import type { EmailAdapter } from './adapter';
import { MockAdapter, OffAdapter } from './mock';
import { ResendAdapter } from './resend';
import { env } from '../env';

let adapter: EmailAdapter | null = null;
export function emailAdapter(): EmailAdapter {
  if (adapter) return adapter;
  const kind = env.emailAdapter();
  if (kind === 'mock') {
    if (process.env.VERCEL_ENV === 'production') throw new Error('The mock email adapter is not allowed in production.');
    adapter = new MockAdapter(process.env.MOCK_EMAIL_LOG);
  } else if (kind === 'resend' && process.env.RESEND_API_KEY) {
    adapter = new ResendAdapter(process.env.RESEND_API_KEY);
  } else adapter = new OffAdapter();
  return adapter;
}
