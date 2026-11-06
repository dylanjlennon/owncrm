-- "Connect your history" (the scheduled RESCUE). The rescue tools on the owner's own computer
-- upload a checked contract folder with a revocable token. It waits here until the owner
-- approves households in the app. Only contract data is stored: no message bodies.

create table public.history_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text,
  scope text not null default 'history_upload' check (scope = 'history_upload'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.history_sources (
  source text primary key,
  status text not null default 'not_connected' check (status in ('not_connected','connected','disconnected')),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_detail text,
  updated_at timestamptz not null default now()
);

create table public.history_batches (
  id uuid primary key default gen_random_uuid(),
  client_batch_id text not null unique check (length(client_batch_id) between 8 and 80),
  source text not null,
  status text not null default 'pending_review' check (status in ('pending_review','saved','rejected','undone')),
  range_start date,
  range_end date,
  payload jsonb not null,
  household_count int not null default 0,
  approved jsonb not null default '[]'::jsonb,
  saved_count int not null default 0,
  import_id uuid references public.imports(id) on delete set null,
  token_id uuid references public.history_tokens(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  undone_at timestamptz
);
create index history_batches_token_idx on public.history_batches (token_id);
create index history_batches_import_idx on public.history_batches (import_id);

-- Optional bring-your-own AI key for server side features. Off by default. Encrypted
-- by the app before it gets here. No Claude or other AI subscription login is ever stored.
create table public.app_secrets (
  name text primary key check (name in ('ai_api_key')),
  ciphertext text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
