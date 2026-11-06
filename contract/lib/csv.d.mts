export function neutralizeCell(value: unknown): string;
export function csvCell(value: unknown): string;
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string;
export function parseCsv(text: string): string[][];
