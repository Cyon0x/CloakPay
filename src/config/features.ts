/**
 * Which payment features CloakPay currently offers.
 *
 * CloakPay does one thing today: paying another registered CloakPay user by
 * username. Two paths that used to sit beside it are switched off while that
 * is the whole product:
 *
 *   * external transfers — a public on-chain transfer to a wallet address that
 *     is not a CloakPay account;
 *   * the shielded pool — deposits, private transfers and withdrawals.
 *
 * They are off in the interface *and* in the API. Nothing here deletes the
 * work behind them: the contracts, the circuits, `src/lib/client/shielded.ts`,
 * the notes and the schema all stay, so re-enabling is a flag and a screen
 * rather than a rebuild. `scripts/shielded-e2e.mjs` still proves the private
 * flow end to end on testnet; it is simply not reachable from the UI.
 *
 * A paused feature is a promise that has not been made, not a feature that
 * quietly falls back to something else. Both switches are read by the server
 * as well as the client, so a stale route or a hand-made request cannot reach
 * a paused path.
 */
export interface PaymentFeatures {
  /** Public transfers to a wallet address that is not a CloakPay account. */
  externalTransfers: boolean;
  /** The shielded pool: deposit, private transfer, withdrawal. */
  shieldedPool: boolean;
}

export const FEATURES: PaymentFeatures = {
  externalTransfers: false,
  shieldedPool: false,
};

export function externalTransfersEnabled(): boolean {
  return FEATURES.externalTransfers;
}

export function shieldedPoolEnabled(): boolean {
  return FEATURES.shieldedPool;
}

/** The one sentence every surface uses for a paused feature. */
export const COMING_SOON = "Coming soon";

/** Why an external transfer is refused, in the same words everywhere. */
export const EXTERNAL_TRANSFER_PAUSED =
  "External transfers are paused. CloakPay currently sends funds between CloakPay users only, by username. Sending to a wallet address that is not a CloakPay account will return in a future update.";
