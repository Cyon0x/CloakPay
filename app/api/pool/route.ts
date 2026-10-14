import { handle, ok } from "@/lib/api";
import { activeChain, explorerAddress } from "@/config/chain";
import { DENOMINATIONS, MERKLE_TREE_DEPTH, getPoolDeployment } from "@/config/pool";

export const dynamic = "force-dynamic";

/**
 * Everything the client needs to talk to the pool, in one place.
 *
 * `deployed` is false until a real deployment is recorded, and the UI is
 * expected to say so rather than offering a deposit that would fail.
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
        address: deployment?.pool ?? null,
        verifier: deployment?.verifier ?? null,
        explorer: deployment ? explorerAddress(deployment.pool) : null,
      },
    });
  } catch (error) {
    return handle(error);
  }
}
