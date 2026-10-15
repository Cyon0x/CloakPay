import { AuthedShell } from "@/components/AuthedShell";
import { WalletAddressCard } from "@/components/WalletAddressCard";
import { Card, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { activeChain, explorerAddress } from "@/config/chain";

export const metadata = { title: "Faucet" };
export const dynamic = "force-dynamic";

const STEPS = [
  "Copy the wallet address below. It is the address CloakPay created for you, and the only one it will ever use.",
  "Open the official Elysium testnet faucet. It is run by the Elysium team, not by CloakPay.",
  "Paste your address there and request testnet HYPE. The faucet applies its own rate limit.",
  "Come back and press Refresh balance. The tokens land in the wallet CloakPay signs with.",
];

/**
 * Faucet.
 *
 * CloakPay operates no faucet, and the chain's faucet is a web service with no
 * documented public API, so there is nothing here to call. Rather than invent a
 * claim, this page does the part that is actually ours: hand over the correct
 * address and show the real balance so the result can be seen.
 */
export default async function FaucetPage() {
  const user = await currentUser();
  if (!user) return null;

  const [wallet] = await db()<{ address: string }[]>`
    select address from wallets where user_id = ${user.userId}
  `;

  return (
    <AuthedShell>
      <PageHeader
        title="Faucet"
        subtitle={`Testnet ${activeChain.nativeToken.symbol} so you can try CloakPay without spending anything real.`}
      />

      <div className="split">
        <Card>
          <div style={{ padding: 22 }}>
            <p className="table-head">Your wallet address</p>
            <div style={{ marginTop: 12 }}>
              <WalletAddressCard
                address={wallet?.address ?? null}
                symbol={activeChain.nativeToken.symbol}
                decimals={activeChain.nativeToken.decimals}
                explorerUrl={wallet ? explorerAddress(wallet.address) : null}
              />
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card>
            <div style={{ padding: 22 }}>
              <p className="table-head">How to get testnet {activeChain.nativeToken.symbol}</p>
              <ol className="faucet-steps">
                {STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <a
                className="btn btn-primary btn-block"
                href={activeChain.faucetUrl}
                target="_blank"
                rel="noreferrer noopener"
                style={{ marginTop: 18 }}
              >
                <Icon name="external" size={15} />
                Open the official Elysium faucet
              </a>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                {activeChain.faucetUrl}
              </p>
            </div>
          </Card>

          <Notice tone="info" title="Why there is no claim button here">
            CloakPay does not run a faucet and the Elysium faucet publishes no API, so a button on this page
            could only pretend to work. Requests are rate limited per address by the faucet itself, and
            nothing in CloakPay can or should bypass that. What CloakPay can do — give you the right address
            and show the real balance — is what this page does.
          </Notice>
        </div>
      </div>
    </AuthedShell>
  );
}
