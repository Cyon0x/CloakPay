-- CloakPay initial schema.
-- Conventions:
--   * snake_case, singular table comments
--   * all ids are uuid generated in the database
--   * all timestamps are timestamptz in UTC
--   * no plaintext wallet keys, seed phrases, or note secrets are ever stored

create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  username          text,
  username_lower    text generated always as (lower(username)) stored,
  display_name      text,
  avatar_url        text,
  -- Privacy preferences. Defaults are the most private reasonable setting.
  profile_visibility text not null default 'username_only'
      check (profile_visibility in ('public', 'username_only', 'private')),
  discoverable      boolean not null default false,
  notify_email      boolean not null default false,
  notify_in_app     boolean not null default true,
  onboarding_step   text not null default 'username'
      check (onboarding_step in ('username', 'security', 'wallet', 'complete')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint users_username_format
    check (username is null or username ~ '^[a-z0-9](?:[a-z0-9_]{2,19})$')
);

-- Username uniqueness is case-insensitive and enforced by the database, not the app.
create unique index if not exists users_username_lower_key on users (username_lower)
  where username is not null;

create index if not exists users_created_at_idx on users (created_at desc);

-- OAuth identities keyed on the provider's stable account id, never on a
-- mutable handle or an email address.
create table if not exists oauth_identities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  provider           text not null check (provider in ('google', 'x')),
  provider_account_id text not null,
  handle             text,
  email              text,
  created_at         timestamptz not null default now(),
  last_login_at      timestamptz not null default now(),
  unique (provider, provider_account_id)
);
create index if not exists oauth_identities_user_idx on oauth_identities (user_id);

-- Sessions. Only a SHA-256 hash of the opaque session token is stored.
create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  token_hash     text not null unique,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '14 days',
  revoked_at     timestamptz,
  user_agent     text
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- Short-lived OAuth handshake state (PKCE verifier + nonce). Rows are consumed
-- once and deleted.
create table if not exists oauth_states (
  state           text primary key,
  provider        text not null check (provider in ('google', 'x')),
  code_verifier   text not null,
  redirect_uri    text not null,
  return_to       text not null default '/dashboard',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '10 minutes'
);

-- Embedded wallet metadata. The private key is stored only as an AEAD
-- ciphertext produced on the client. The server can never read it.
create table if not exists wallets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references users(id) on delete cascade,
  address        text not null,
  -- Envelope: { v, alg, kdf, salt, iterations, iv, ciphertext, mac }
  key_envelope   jsonb not null,
  key_version    int not null default 1,
  recovery_confirmed_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists wallets_address_idx on wallets (lower(address));

-- Shielded notes. `ciphertext` is an AEAD blob addressed to the owner's
-- viewing key. No amount, secret, or asset is readable by the server.
create table if not exists shielded_notes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  chain_id         integer not null,
  denomination_id  text not null,
  commitment       text not null,
  nullifier_hash   text,
  -- AEAD envelope addressed to the owner: { alg, epk, iv, ciphertext }
  note_envelope    jsonb not null,
  status           text not null default 'unspent'
      check (status in ('unspent', 'spending', 'spent', 'invalid')),
  origin           text not null check (origin in ('deposit', 'payment')),
  origin_payment_id uuid,
  created_at       timestamptz not null default now(),
  spent_at         timestamptz,
  spent_tx_hash    text,
  unique (chain_id, commitment)
);
create index if not exists shielded_notes_user_idx on shielded_notes (user_id, status);
create index if not exists shielded_notes_commitment_idx on shielded_notes (commitment);

-- Payment links. `code` is the public slug in /pay/<code>.
create table if not exists payment_links (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  owner_user_id   uuid not null references users(id) on delete cascade,
  title           text,
  description     text,
  -- null amount => payer chooses; otherwise the amount is fixed
  amount_wei      numeric(78,0),
  denomination_id text,
  asset           text not null default 'HYPE',
  mode            text not null default 'record'
      check (mode in ('private', 'public', 'record')),
  reusable        boolean not null default true,
  max_uses        integer,
  uses            integer not null default 0,
  expires_at      timestamptz,
  status          text not null default 'active'
      check (status in ('active', 'disabled', 'expired')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payment_links_uses_within_max
    check (max_uses is null or uses <= max_uses)
);
create index if not exists payment_links_owner_idx on payment_links (owner_user_id, created_at desc);

-- Payment requests (an invoice addressed to one user).
create table if not exists payment_requests (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references users(id) on delete cascade,
  payer_user_id  uuid references users(id) on delete set null,
  amount_wei     numeric(78,0),
  description    text,
  asset          text not null default 'HYPE',
  status         text not null default 'open'
      check (status in ('open', 'paid', 'declined', 'cancelled', 'expired')),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);
create index if not exists payment_requests_owner_idx on payment_requests (owner_user_id, created_at desc);
create index if not exists payment_requests_payer_idx on payment_requests (payer_user_id, status);

-- Payments. One row per attempted settlement. Idempotency keys make retries safe.
create table if not exists payments (
  id              uuid primary key default gen_random_uuid(),
  chain_id        integer not null,
  -- 'private' only ever set once the shielded flow completed for that leg
  privacy         text not null check (privacy in ('private', 'public')),
  status          text not null default 'pending'
      check (status in ('pending', 'submitted', 'confirmed', 'failed', 'expired')),
  from_user_id    uuid references users(id) on delete set null,
  to_user_id      uuid references users(id) on delete set null,
  amount_wei      numeric(78,0),
  denomination_id text,
  asset           text not null default 'HYPE',
  note            text,
  link_id         uuid references payment_links(id) on delete set null,
  request_id      uuid references payment_requests(id) on delete set null,
  commitment      text,
  nullifier_hash  text,
  tx_hash         text,
  block_number    bigint,
  failure_reason  text,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  confirmed_at    timestamptz,
  unique (idempotency_key)
);
create index if not exists payments_from_idx on payments (from_user_id, created_at desc);
create index if not exists payments_to_idx on payments (to_user_id, created_at desc);
create index if not exists payments_status_idx on payments (status);
create index if not exists payments_chain_tx_idx on payments (chain_id, tx_hash);

alter table shielded_notes
  add constraint shielded_notes_origin_payment_fk
  foreign key (origin_payment_id) references payments(id) on delete set null;

-- Indexed on-chain pool events, so history can be reconstructed without
-- trusting the client.
create table if not exists pool_events (
  id            bigserial primary key,
  chain_id      integer not null,
  contract      text not null,
  event_name    text not null,
  block_number  bigint not null,
  block_time    timestamptz,
  log_index     integer not null,
  tx_hash       text not null,
  commitment    text,
  leaf_index    integer,
  nullifier_hash text,
  denomination_wei numeric(78,0),
  unique (chain_id, tx_hash, log_index)
);
create index if not exists pool_events_leaves_idx on pool_events (chain_id, leaf_index);
create index if not exists pool_events_block_idx on pool_events (chain_id, block_number);
create index if not exists pool_events_nullifier_idx on pool_events (nullifier_hash);

create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  kind         text not null,
  -- Rendered server-side from structured data; never contains note secrets.
  title        text not null,
  body         text,
  payload      jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists audit_events (
  id          bigserial primary key,
  user_id     uuid references users(id) on delete set null,
  kind        text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_events_kind_idx on audit_events (kind, created_at desc);

-- Rate limiting for sensitive endpoints (login attempts, username checks).
create table if not exists rate_limits (
  bucket        text primary key,
  count         integer not null default 0,
  window_start  timestamptz not null default now()
);
