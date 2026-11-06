export const CONTRACT_VERSION: string;
export const CSV_FILES: string[];
export const MAX_HOUSEHOLDS: number;
export type ContractError = { file: string; line: number | string; column: string; problem: string };
export function validateContract(input: { manifest: string | null; files: Record<string, string | null | undefined>; extraFiles?: string[] }):
  { ok: false; errors: ContractError[]; counts: Record<string, number> } |
  { ok: true; errors: ContractError[]; counts: Record<string, number>; data: Record<string, any> };
export function errorsCsv(errors: ContractError[]): string;
export function filterContract(data: Record<string, any>, keep: Set<string>): Record<string, any>;
