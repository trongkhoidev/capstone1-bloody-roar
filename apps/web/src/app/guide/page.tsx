import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guide",
  description: "How Bloody-Roar works for clients and developers, from first sign-in to payout and disputes.",
};

const CLIENT_STEPS = [
  ["Connect your wallet", "Sign in with a wallet. Your wallet address is your account. Add a name and skills on your profile."],
  ["Post a bounty", "Describe the issue, add acceptance criteria and screenshots, pick the reward and a deadline. Link the GitHub repository."],
  ["Choose a developer", "Developers apply with a short message. Read their profile, skills and past work, then select one."],
  ["Fund the escrow", "You have 24 hours to lock the reward in the escrow contract. If you do not, the bounty reopens."],
  ["Review the delivery", "The developer sends a pull request. Accept it to release the payment, or open a dispute."],
];

const DEV_STEPS = [
  ["Build your profile", "Add skills, links (GitHub, LinkedIn, portfolio) and an avatar so clients trust you."],
  ["Find a bounty", "Search by keyword or skill. Open a bounty to read the scope and the discussion."],
  ["Apply", "Send a short message about how you will solve it. Ask questions in the discussion first if the scope is unclear."],
  ["Deliver", "Once the client has funded the escrow, work on the issue and submit your pull request before the deadline."],
  ["Get paid", "When the client accepts, the contract pays you. If the client stays silent past the review window, you can claim."],
];

const RULES = [
  ["24 h", "For the client to fund after selecting a developer. Otherwise the bounty reopens."],
  ["7 days", "Review window after the latest submission. Resubmitting starts a fresh window; silence lets the developer claim."],
  ["72 h", "For the other side to add evidence once a dispute opens. No ruling before it closes."],
  ["10%", "Platform fee, paid by the client on top of the bounty: a 100 USDC bounty costs 110. The developer gets the full bounty. A full refund returns the fee too."],
];

function Steps({ title, steps }: { title: string; steps: string[][] }) {
  return (
    <section className="card" style={{ padding: 24 }}>
      <h2 className="h1" style={{ fontSize: 20, marginBottom: 16 }}>{title}</h2>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {steps.map(([head, body], index) => (
          <li key={head} style={{ display: "flex", gap: 14 }}>
            <span className="mono" style={{ flex: "none", width: 28, height: 28, borderRadius: 999, background: "var(--sunk)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13 }}>{index + 1}</span>
            <div><b style={{ color: "var(--ink)" }}>{head}</b><p style={{ margin: "2px 0 0", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6 }}>{body}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Guide</p>
        <h1 className="display" style={{ fontSize: 36, marginTop: 6 }}>How Bloody-Roar works</h1>
        <p className="lead" style={{ maxWidth: 640 }}>
          Clients post GitHub issues with a USDC reward. Developers apply and deliver a pull request. An escrow contract holds the money, so neither side, nor the platform, can take it back unilaterally.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Link href="/marketplace" className="btn btn-p">Browse bounties</Link>
          <Link href="/issues/create" className="btn btn-o">Post a bounty</Link>
          <Link href="/profile" className="btn btn-o">Set up profile</Link>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Steps title="If you post bounties" steps={CLIENT_STEPS} />
        <Steps title="If you solve bounties" steps={DEV_STEPS} />
      </div>

      <section id="rules" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h2 className="h1" style={{ fontSize: 22 }}>Escrow rules, fixed in the contract</h2>
          <p className="sub">Every number below is a constant in BloodyRoarEscrow.sol. Nobody can change them for a funded bounty.</p>
        </div>
        <div className="rules">
          {RULES.map(([value, text]) => (
            <div className="rule" key={value}><div className="v mono">{value}</div><p>{text}</p></div>
          ))}
        </div>
      </section>

      <section id="disputes" className="card" style={{ padding: 24 }}>
        <h2 className="h1" style={{ fontSize: 20 }}>If something goes wrong</h2>
        <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>
          Either side can open a dispute from the bounty page. Both sides then have 72 hours to upload evidence (screenshots, logs, links). After that window an arbiter rules on the case and the contract pays out the result. Use the discussion on each bounty to settle scope questions before work starts, so disputes stay rare.
        </p>
      </section>

      <section className="card" style={{ padding: 24 }}>
        <h2 className="h1" style={{ fontSize: 20 }}>Tips</h2>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.8 }}>
          <li>Write acceptance criteria that can be checked: a test that passes, a screen that renders.</li>
          <li>Paste screenshots straight into the scope box or the discussion.</li>
          <li>Keep skills on your profile current. Matching bounties notify you.</li>
        </ul>
      </section>
    </main>
  );
}
