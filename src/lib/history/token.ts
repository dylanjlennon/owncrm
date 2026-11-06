import { randomBytes } from 'node:crypto';
import { sha256 } from '../secure';

export function newHistoryToken(): { token: string; hash: string } {
  const token = `och_${randomBytes(32).toString('base64url')}`;
  return { token, hash: sha256(token) };
}
export const hashHistoryToken = (t: string) => sha256(t);
