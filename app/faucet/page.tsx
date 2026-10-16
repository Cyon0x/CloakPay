import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { Card, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { currentUserOrRedirect } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Faucet" };
export const dynamic = "force-dynamic";

const STEPS = [
  "Open your Receive page and copy the address under \u201cReceive from external wallet\u201d.",
  "Open the official Elysium testnet faucet. It is run by the Elysium team, not by CloakPay.",
  "Paste your address there and request testnet HYPE. The faucet applies its own rate limit.",
  "Come back to your dashboard. The balance shown there is read from the chain, so the tokens appear as soon as they land.",
];

/**
 * Faucet.
 *
 * CloakPay operates no faucet, and the chain's faucet is a web service with no
 * documented public API, so there is nothing here to call. Rather than invent a
 * claim, this page does the part that is actually ours: it explains the steps
 * and sends the user to the one screen that shows an address.
 *
 * The address itself is deliberately not printed here. CloakPay shows an address
 * on the Receive page and nowhere else, and a second copy on a second page is
 * exactly the drift that rule exists to prevent.
 */
export default async function FaucetPage() {
  await currentUserOrRedirect();

  return (
    <AuthedShell>
      <PageHeader
        title="Faucet"
        subtitle={`Testnet ${activeChain.nativeToken.symbol} so you can try CloakPay without spending anything real.`}
      />

      <div className="split">
        <Card>
          <div style={{ padding: 22 }}>
            <p className="table-head">How to get testnet {activeChain.nativeToken.symbol}</p>
            <ol className="faucet-steps">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="stack-sm" style={{ marginTop: 18 }}>
              <Link href="/receive" className="btn btn-primary btn-block">
                <Icon name="receive" size={15} />
                Get your receive address
              </Link>
              <a
                className="btn btn-secondary btn-block"
                href={activeChain.faucetUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="external" size={15} />
                Open the official Elysium faucet
              </a>
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              {activeChain.faucetUrl}
            </p>
          </div>
        </Card>

        <div className="stack">
          <Notice tone="info" title="Where the address is">
            Your receive address is on the{" "}
            <Link className="link" href="/receive">
              Receive page
            </Link>
            . CloakPay keeps addresses to that one screen — payments between CloakPay users are addressed to
            usernames, so no other page needs one.
          </Notice>

          <Notice tone="info" title="Why there is no claim button here">
            CloakPay does not run a faucet and the Elysium faucet publishes no API, so a button on this page
            could only pretend to work. Requests are rate limited per address by the faucet itself, and
            nothing in CloakPay can or should bypass that.
          </Notice>
        </div>
      </div>
    </AuthedShell>
  );
}
