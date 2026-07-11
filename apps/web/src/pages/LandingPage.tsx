import { RiskDisclaimer } from "../components/ui/RiskDisclaimer";

const AGENTS = [
  { name: "Ben", role: "The Owner", desc: "Buys like he'll hold the business for a decade — cash generation and moat first." },
  { name: "Sam", role: "The Income Investor", desc: "Leads with payout durability and yield — is the dividend actually safe?" },
  { name: "Vera", role: "The Analyst", desc: "Leads with reported cash flow and valuation — is this cheap, fair, or a trap?" },
  { name: "Rex", role: "The Trader", desc: "Leads with momentum and volume — fast entries, faster exits." },
  { name: "Nadia", role: "The Quant", desc: "Leads with measurable signal and factor evidence, no narrative." },
];

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen bg-[#0e0e10] text-[#ececee]">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5">
        <div className="text-[18px] font-bold">
          <span className="text-[#ececee]">Alpha</span><span className="text-[#3ecf8e]">Wolf</span>
        </div>
        <button type="button" onClick={onEnter} className="rounded-[8px] bg-[#3ecf8e] px-4 py-2 text-[13px] font-bold text-[#0a0c0f] hover:opacity-90">
          Open Dashboard
        </button>
      </header>

      <main className="mx-auto max-w-[820px] px-6 pb-10 pt-10 text-center">
        <h1 className="text-[32px] font-extrabold leading-[1.15] tracking-[-0.5px] sm:text-[42px]">
          An AI Agent desk for your Thai &amp; US stock portfolio
        </h1>
        <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-[1.65] text-[#8c8c95]">
          Track SET (.BK) and US holdings in one place, get a daily buy/wait verdict from an AI Agent with a real,
          named decision method, and see exactly when a stock's dividend cycle favors buying. No single generic
          model wearing five different labels — each Agent reasons its own way, on the same evidence.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={onEnter} className="rounded-[10px] bg-[#3ecf8e] px-6 py-3 text-[14px] font-bold text-[#0a0c0f] hover:opacity-90">
            Open Alpha Wolf — free
          </button>
        </div>
      </main>

      <section className="mx-auto max-w-[1100px] px-6 py-10">
        <h2 className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#5a5a62]">Five Agents, five real methods</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {AGENTS.map((agent) => (
            <div key={agent.name} className="rounded-[12px] border border-[#2a2a31] bg-[#161619] p-4 text-left">
              <div className="text-[14px] font-bold text-[#ececee]">{agent.name}</div>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#3ecf8e]">{agent.role}</div>
              <div className="mt-2 text-[12px] leading-[1.5] text-[#8c8c95]">{agent.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1100px] gap-4 px-6 py-8 sm:grid-cols-3">
        <Feature
          title="AI Replay — an honest backtest"
          body="Replay any Agent's own past buy/hold/trim/sell calls on a stock against plain monthly dollar-cost averaging. No look-ahead bias, real dividend cash flows, disclosed limitations. It can lose to plain DCA — and shows it when it does."
        />
        <Feature
          title="Dividend-cycle Buy Timing"
          body="Buy Timing reads a stock's actual ex-dividend cycle, not just generic technicals, to flag when the post-ex dip historically favors adding."
        />
        <Feature
          title="Built for SET + US together"
          body="THB shows first, USD as a secondary conversion, so a Thai portfolio holding both .BK and US names reads naturally in one dashboard."
        />
      </section>

      <section className="mx-auto max-w-[820px] px-6 py-8 text-center">
        <button type="button" onClick={onEnter} className="rounded-[10px] bg-[#3ecf8e] px-6 py-3 text-[14px] font-bold text-[#0a0c0f] hover:opacity-90">
          Open Alpha Wolf — free
        </button>
      </section>

      <RiskDisclaimer />
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-[#2a2a31] bg-[#161619] p-5 text-left">
      <div className="text-[14px] font-bold text-[#ececee]">{title}</div>
      <div className="mt-2 text-[12.5px] leading-[1.6] text-[#8c8c95]">{body}</div>
    </div>
  );
}
