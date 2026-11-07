export function redact(text: string | null | undefined): { text: string; hits: string[] };
export function containsSensitive(text: string | null | undefined): boolean;
export function normalizeText(text: string): string;
export const MAX_CHECK_CHARS: number;
