-- Adds the pieces the web application needs on top of 001_init.sql.

-- The viewing key receives private payments. Only its public half is stored;
-- the private half lives inside the user's sealed key envelope.
alter table wallets
  add column if not exists viewing_public_key jsonb,
  add column if not exists viewing_key_id text,
  add column if not exists custody text not null default 'embedded-self-custodial'
    check (custody in ('embedded-self-custodial'));

create index if not exists wallets_viewing_key_id_idx on wallets (viewing_key_id);

-- A payment link can be claimed only once when it is not reusable.
alter table payment_links
  add column if not exists claimed_by_user_id uuid references users(id) on delete set null,
  add column if not exists claimed_at timestamptz;

-- Links are looked up by their public code on the checkout page.
create index if not exists payment_links_code_idx on payment_links (code);

-- Notes delivered to a recipient are addressed to that recipient.
alter table shielded_notes
  add column if not exists link_id uuid references payment_links(id) on delete set null;

-- Operational: remember what the app believes the pool state is, so a client
-- never has to trust its own cache.
create table if not exists pool_state (
  chain_id        integer not null,
  pool_address    text not null,
  denomination_id text not null,
  leaf_count      integer not null default 0,
  last_root       text,
  last_block      bigint not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (chain_id, pool_address, denomination_id)
);

-- Idempotency for link claims and payment submissions is enforced by
-- payments.idempotency_key (001) plus this unique guard on link claims.
create unique index if not exists payments_one_claim_per_link
  on payments (link_id)
  where link_id is not null and status in ('confirmed', 'submitted', 'pending');
