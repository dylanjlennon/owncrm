// Vercel refuses any request body over about 4.5 MB before the app sees it, with a platform
// error page. So imports stop at 4 MB, checked in the browser before upload and again on the
// server, with a message that says what to do instead.
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;
export const IMPORT_TOO_BIG = 'Over the 4 MB limit for one upload. Split a spreadsheet into smaller files. For a big rescue folder, ask your AI agent to run "npm run contract:sql" and paste the result into the Supabase SQL editor (see contract/README.md), or rerun the rescue with fewer months at a time.';
export function importSizeProblem(totalBytes: number): string | null {
  return totalBytes > IMPORT_MAX_BYTES ? IMPORT_TOO_BIG : null;
}

// The public lead form. Per address: 10 posts in 10 minutes. Site-wide: 60 an hour before new
// leads are held for the "Many new leads" list (still saved), and 600 an hour before posts are
// refused outright to protect the database.
export const LEAD_LIMITS = { perIp: 10, perHour: 60, hardPerHour: 600 };
