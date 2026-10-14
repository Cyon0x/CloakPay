-- Native sign-in support.
--
-- The browser gets a session from an httpOnly cookie. A React Native app has no
-- cookie jar it can rely on across a deep-link round trip, so the provider
-- callback hands the app a one-time code and the app exchanges it for a bearer
-- token.
--
-- The code is single use, expires in two minutes, and is stored only as a hash,
-- so a leaked redirect URL is not a login on its own. The session is created at
-- exchange time, which means no usable token is ever written into a URL.

create table if not exists auth_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '2 minutes',
  consumed_at timestamptz
);
create index if not exists auth_codes_user_idx on auth_codes (user_id);
