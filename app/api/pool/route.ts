import { handle, ok } from "@/lib/api";
import { activeChain, explorerAddress } from "@/config/chain";
import {
  DENOMINATIONS,
  MERKLE_TREE_DEPTH,
  getPoolDeployment,
  privatePaymentsAvailable,
} from "@/config/pool";

export const dynamic = "force-dynamic";

/**
 * Everything the client needs to talk to the pool, in one place.
 *
 * `deployed` is false until a real deployment is recorded, and the UI is
 * expected to say so rather than offering a deposit that would fail.
 *
 * `privateReady` is the narrower question and the one clients should gate on:
 * a deployed pool is not by itself a private payment, because without the
 * deposit and withdrawal flow there is no way to spend a note. Keeping the two
 * apart is what stops a client from offering a private payment the server will
 * refuse with `privacy_unavailable`.
 */
export async function GET() {
  try {
    const deployment = getPoolDeployment(activeChain.chainId);
    return ok({
      chain: {
        name: activeChain.name,
        chainId: activeChain.chainId,
        hexChainId: activeChain.hexChainId,
        rpcUrl: activeChain.rpcUrl,
        explorerUrl: activeChain.explorerUrl,
        faucetUrl: activeChain.faucetUrl,
        nativeToken: activeChain.nativeToken,
      },
      pool: {
        depth: MERKLE_TREE_DEPTH,
        denominations: DENOMINATIONS.map((d) => ({
          id: d.id,
          label: d.label,
          wei: d.wei.toString(),
        })),
        deployed: Boolean(deployment),
        privateReady: privatePaymentsAvailable(activeChain.chainId),
        address: deployment?.pool ?? null,
        verifier: deployment?.verifier ?? null,
        explorer: deployment ? explorerAddress(deployment.pool) : null,
      },
    });
  } catch (error) {
    return handle(error);
  }
}
