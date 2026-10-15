import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";
import { Notice } from "@/components/ui";
import { activeChain } from "@/config/chain";
import { getPoolDeployment, poolStatus } from "@/config/pool";

export const metadata = { title: "How it works" };

const STEPS = [
  {
    title: "A note is created on your device",
    body: "When you deposit, your browser generates two random secrets, a nullifier and a secret, and hashes them together with Poseidon to produce a commitment. Only the commitment is published.",
  },
  {
    title: "The commitment joins a Merkle tree",
    body: "The pool inserts the commitment as a leaf. The tree root changes, and the contract remembers every root it has produced, because a proof is always made against the root that existed when the note was created.",
  },
  {
    title: "The note is sealed to the recipient",
    body: "To pay someone, your browser encrypts the note with the recipient's viewing key using ECIES (P-256, HKDF, AES-256-GCM). We can store the ciphertext and still be unable to read it.",
  },
  {
    title: "A Groth16 proof is generated in the browser",
    body: "When the recipient withdraws, their device proves, without revealing which leaf it is, that it knows (nullifier, secret) for some commitment in the tree, and that the nullifier has not been used before.",
  },
  {
    title: "The contract verifies and pays",
    body: `The proof is verified by the on-chain verifier using the BN254 pairing precompile. The nullifier is recorded so the note cannot be spent twice, and ${activeChain.nativeToken.symbol} is released. The chain never learns which deposit this was.`,
  },
];

export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  const user = await currentUser();
  const poolLive = poolStatus(activeChain.chainId) === "ready";
  const deployment = getPoolDeployment(activeChain.chainId);
  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 760, paddingTop: 48, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 32 }}>How the privacy works</h1>
          <p className="lede" style={{ marginTop: 14 }}>
            The short version: a shielded pool built from Poseidon commitments, a Merkle tree, nullifiers
            and Groth16 proofs that the contract verifies itself. No frontend toggle, no database
            permission, and no claim that a plain transfer is private.
          </p>

          <div style={{ marginTop: 22 }}>
            {poolLive ? (
              <Notice tone="ok" title="In service">
                The pool is deployed on {activeChain.name} at{" "}
                <span className="mono">{deployment?.pool}</span>. Private payments are open.
              </Notice>
            ) : (
              <Notice tone="warn" title="Built, tested, not yet deployed">
                The circuit compiles, the contract passes its tests, and a real Groth16 proof verifies
                against the deployed verifier in the test suite. No deployment has been recorded for{" "}
                {activeChain.name} yet, so CloakPay does not offer a private payment today. Rather than
                quietly sending a public transfer and calling it private, the option is switched off and
                says so. The steps below describe the design as implemented.
              </Notice>
            )}
          </div>

          <div className="stack" style={{ marginTop: 34 }}>
            {STEPS.map((step, index) => (
              <section key={step.title} className="card-flat" style={{ padding: 22 }}>
                <p className="mono tiny muted">{String(index + 1).padStart(2, "0")}</p>
                <h2 style={{ fontSize: 17, marginTop: 6 }}>{step.title}</h2>
                <p className="muted" style={{ marginTop: 7, fontSize: 14 }}>
                  {step.body}
                </p>
              </section>
            ))}
          </div>

          <section className="card-quiet" style={{ padding: 22, marginTop: 30 }}>
            <h2 style={{ fontSize: 17 }}>What is not private</h2>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              Amounts live inside fixed denominations, so an observer learns which denomination moved, not
              the exact figure. Deposits and withdrawals are individually public. If only a few notes are
              outstanding in a denomination, the anonymity set is small. That is a real limit, and it shrinks
              every time someone reuses one wallet address for both a deposit and a withdrawal.
            </p>
            <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
              Notes are bearer instruments. Whoever holds an unspent note can spend it, so a recipient
              should claim a payment rather than letting it sit. Binding a note to a recipient key is a
              planned upgrade and is not implemented today.
            </p>
          </section>

          <p style={{ marginTop: 26 }}>
            <Link href="/security" className="link">
              Read the full threat model
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
