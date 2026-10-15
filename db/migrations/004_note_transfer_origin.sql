-- A note can now arrive in one of three ways, and the difference is worth
-- recording because a user reads it back on the Privacy page:
--
--   deposit   you put your own funds into the pool
--   payment   someone settled a payment link or a username payment with you
--   transfer  someone sent you a shielded transfer (clients/transfer.circom)
--
-- 001_init.sql only allowed the first two. Nothing about the column changes
-- besides the set of permitted values: no existing row is touched, and every
-- row that exists today keeps the origin it already has.

alter table shielded_notes drop constraint if exists shielded_notes_origin_check;

alter table shielded_notes
  add constraint shielded_notes_origin_check
  check (origin in ('deposit', 'payment', 'transfer'));

-- A transfer names the sender's note it consumed. The nullifier is already
-- public on chain, so storing it here adds nothing an observer could not read
-- from the pool's own events; it is kept so a recipient can see which spend
-- created their note. The intent's nullifier is *not* a secret.
comment on column shielded_notes.nullifier_hash is
  'Nullifier hash of the note this row''s own note was spent with (public on chain once spent).';
