/**
 * Wallet-address rules for public transfers.
 *
 * Only the external transfer flow accepts an address, and it is the one place a
 * recipient's address is legitimately on screen: an ordinary transfer is public
 * on chain anyway, so hiding the destination from the person paying would be a
 * lie about what the transaction does.
 */
import { getAddress, isAddress } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type AddressResult =
  | { ok: true; address: `0x${string}` }
  | { ok: false; reason: string };

export function validateExternalAddress(input: string, self?: string | null): AddressResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "Enter a wallet address." };
  if (!EVM_ADDRESS.test(trimmed)) {
    return { ok: false, reason: "An Elysium address is 0x followed by 40 hexadecimal characters." };
  }
  if (!isAddress(trimmed)) {
    return { ok: false, reason: "That address fails its checksum. Compare it against the source you copied it from." };
  }
  const checksummed = getAddress(trimmed);
  if (checksummed === ZERO_ADDRESS) {
    return { ok: false, reason: "That is the zero address. Anything sent there is lost." };
  }
  if (self && checksummed.toLowerCase() === self.toLowerCase()) {
    return { ok: false, reason: "That is this wallet's own address." };
  }
  return { ok: true, address: checksummed };
}
