/**
 * What CloakPay actually hides, stated once.
 *
 * Written for the pool's own page, and kept here rather than deleted while the
 * pool is switched off: the lists describe the design as written in
 * `contracts/src/ShieldedPool.sol`, so when private payments come back they can
 * be rendered again without restating what the pool does and does not hide.
 *
 * Nothing renders them today. The public pages say what a user needs to know --
 * that private payments are coming soon, and that an ordinary transfer is not
 * private -- without the internals.
 */

export const HIDDEN: readonly string[] = [
  "The connection between a payer and a recipient",
  "Which deposit funded which withdrawal",
  "How many payments one person has received",
  "The exact amount, within the pool's fixed denominations",
];

export const VISIBLE: readonly string[] = [
  "That some address deposited a given denomination",
  "That some address withdrew a given denomination",
  "Timing, and who paid the gas",
  "The size of the pool, and therefore the anonymity set",
];

export const NEVER: readonly string[] = [
  "Your note secrets, which never leave your device unsealed",
  "Your wallet's private key",
  "Your Google or X identity",
];

/** Shared wording for the one thing a username does and does not buy you. */
export const USERNAME_IS_NOT_PRIVACY =
  "A username is a naming layer, not a privacy layer. Paying @someone still records a payment; only the shielded pool changes what the chain can see.";
