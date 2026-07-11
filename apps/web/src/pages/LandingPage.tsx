import { RiskDisclaimer } from "../components/ui/RiskDisclaimer";

const AGENTS = [
  { name: "Ben", role: "The Owner", desc: "Buys like he'll hold the business for a decade — cash generation and moat first.", color: "#3ecf8e", image: "/agents/ben-hathaway.png" },
  { name: "Sam", role: "The Income Investor", desc: "Leads with payout durability and yield — is the dividend actually safe?", color: "#f5c451", image: "/agents/sam-cornerstone.png" },
  { name: "Vera", role: "The CFA Banker", desc: "A CFA Level III banker who judges cash flow, capital structure, and valuation like a real pro.", color: "#74a4ff", image: "/agents/vera-sterm.png" },
  { name: "Rex", role: "The Trader", desc: "Leads with momentum and volume — fast entries, faster exits.", color: "#f2575c", image: "/agents/rex-malone.png" },
  { name: "Nadia", role: "The Quant", desc: "Leads with measurable signal and factor evidence, no narrative.", color: "#a78bfa", image: "/agents/nadia-quant.png" },
];

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0e0e10] text-[#ececee]">
      <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-[#0e0e10]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-4 sm:px-6">
          <button type="button" onClick={() => scrollTo("top")} className="flex items-center gap-2.5 text-left" aria-label="Back to top">
            <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-[9px]" />
            <span className="text-[19px] font-extrabold tracking-[-0.03em]">Alpha<span className="text-[#3ecf8e]">Wolf</span></span>
          </button>
          <nav className="hidden items-center gap-7 text-[13px] font-medium text-[#8c8c95] md:flex" aria-label="Welcome page">
            <button type="button" onClick={() => scrollTo("agents")} className="transition hover:text-[#ececee]">Agents</button>
            <button type="button" onClick={() => scrollTo("replay")} className="transition hover:text-[#ececee]">AI Replay</button>
            <button type="button" onClick={() => scrollTo("features")} className="transition hover:text-[#ececee]">Dividend Timing</button>
          </nav>
          <button type="button" onClick={onEnter} className="rounded-[8px] bg-[#3ecf8e] px-4 py-2.5 text-[12px] font-extrabold text-[#07100c] transition hover:brightness-110 sm:px-5 sm:text-[13px]">Open Dashboard</button>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-[1100px] items-start gap-10 px-5 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_480px] lg:gap-12 lg:pt-16">
          <div className="pt-1">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2a2a31] bg-[#161619] px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-[#3ecf8e] sm:text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3ecf8e] shadow-[0_0_10px_#3ecf8e]" />5 NAMED AGENTS · REAL DECISION METHODS
            </div>
            <h1 className="max-w-[590px] text-[38px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[48px]">An AI Agent desk for your Thai &amp; US stock portfolio</h1>
            <p className="mt-5 max-w-[560px] text-[15px] leading-[1.7] text-[#8c8c95] sm:text-[16px]">Track SET (.BK) and US holdings in one place. Get a daily buy, wait, trim, or sell verdict from an AI Agent with a real decision method—and see when a stock&apos;s dividend cycle favors buying.</p>
            <p className="mt-3 max-w-[550px] text-[13px] leading-[1.65] text-[#5f5f68]">No generic model wearing five labels. Each Agent keeps its own character, risk judgment, and way of seeing the same evidence.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" onClick={onEnter} className="rounded-[10px] bg-[#3ecf8e] px-6 py-3.5 text-[14px] font-extrabold text-[#07100c] transition hover:brightness-110">Open Alpha Wolf — free</button>
              <button type="button" onClick={() => scrollTo("replay")} className="rounded-[10px] border border-[#2a2a31] px-5 py-3.5 text-[14px] font-bold transition hover:border-[#4a4a52] hover:bg-[#161619]">See an AI Replay</button>
            </div>
            <div className="mt-9 flex flex-wrap gap-8 sm:gap-10">
              <Stat value="5" label="named Agents" />
              <Stat value="SET + US" label="one dashboard" />
              <Stat value="Daily" label="buy / wait verdicts" />
            </div>
          </div>
          <VerdictCard />
        </section>

        <section id="agents" className="scroll-mt-24 border-y border-[#1b1b20] bg-[#111114]">
          <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-6">
            <SectionHeading eyebrow="Five Agents, five real methods" title="Different minds. The same market evidence." />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {AGENTS.map((agent) => (
                <article key={agent.name} className="rounded-[12px] border border-[#2a2a31] bg-[#161619] p-4 transition duration-200 hover:-translate-y-1 hover:border-[#44444d]">
                  <div className="flex items-center gap-3">
                    <img src={agent.image} alt={`${agent.name} AI Agent`} className="h-11 w-11 rounded-[11px] border object-cover" style={{ borderColor: `${agent.color}66`, background: `${agent.color}18` }} />
                    <div><h3 className="text-[14px] font-bold">{agent.name}</h3><p className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: agent.color }}>{agent.role}</p></div>
                  </div>
                  <p className="mt-3 text-[11.5px] leading-[1.55] text-[#8c8c95]">{agent.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-[1100px] px-5 py-16 sm:px-6">
          <SectionHeading eyebrow="Where the AI actually does the work" title="Three reads, every day, on autopilot" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FeatureCard title="Daily Brief" body="Your whole portfolio triaged every morning: what needs you today, what to watch, and what to leave alone."><DailyBriefDemo /></FeatureCard>
            <FeatureCard title="Dividend Buy Timing" body="Reads each stock's real ex-dividend cycle—not generic technicals—to flag when the post-ex dip favors adding."><TimingDemo /></FeatureCard>
            <FeatureCard title="Today's Signal" body="A live buy score on any ticker, on demand, with the Agent's reasoning attached—not just a number."><SignalDemo /></FeatureCard>
          </div>
          <div className="mt-5 rounded-[12px] border border-[#2a2a31] bg-[#161619] p-5 sm:p-6">
            <h3 className="text-[14px] font-bold">Built for SET + US together</h3>
            <p className="mt-2 max-w-[700px] text-[12.5px] leading-[1.65] text-[#8c8c95]">THB shows first, USD as a secondary conversion, so a Thai portfolio holding both .BK and US names reads naturally in one dashboard.</p>
          </div>
        </section>

        <section id="replay" className="scroll-mt-24 mx-auto max-w-[1100px] px-5 pb-16 sm:px-6">
          <div className="grid items-center gap-8 rounded-[14px] border border-[#2a2a31] bg-[#161619] p-6 sm:p-8 md:grid-cols-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5a5a62]">AI Replay · NVDA · Vera&apos;s method</div>
              <h2 className="mt-2 text-[21px] font-bold tracking-[-0.02em]">3 years, real dividend cash flows, no look-ahead</h2>
              <p className="mt-3 text-[13px] leading-[1.65] text-[#8c8c95]">Every decision is dated and logged before the outcome is known. When an Agent loses to plain DCA, AlphaWolf shows that month too—including exposure, cash reserve, dividends, drawdown, and the real cost of protection.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ReplayMetric label="Agent · Vera" value="+61.4%" color="#3ecf8e" />
              <ReplayMetric label="Plain monthly DCA" value="+44.9%" color="#8c8c95" />
              <div className="col-span-2 rounded-[9px] border border-[#26262c] bg-[#111114] px-4 py-3 text-[10.5px] leading-[1.5] text-[#686871]">Illustrative historical replay—not a forecast. Returns include accumulated dividends.</div>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 text-center sm:px-6">
          <h2 className="text-[27px] font-extrabold tracking-[-0.03em]">Give every holding a second opinion.</h2>
          <p className="mx-auto mt-3 max-w-[500px] text-[13px] leading-[1.6] text-[#777780]">Start free. Unlock Hunt AI Pro for 30 days with no card when you&apos;re ready.</p>
          <button type="button" onClick={onEnter} className="mt-6 rounded-[12px] bg-gradient-to-r from-[#3ecf8e] via-[#60a5fa] to-[#a78bfa] p-[1.5px] transition hover:brightness-110"><span className="block rounded-[10.5px] bg-[#101113] px-7 py-3.5 text-[14px] font-extrabold text-[#ececee]">Open Alpha Wolf — free</span></button>
        </section>
      </main>

      <footer className="border-t border-[#19191e] px-5 py-7"><RiskDisclaimer /></footer>
    </div>
  );
}

function VerdictCard() {
  return (
    <article className="rounded-[16px] border border-[#3ecf8e]/35 bg-[#3ecf8e]/[0.055] p-4 shadow-[0_30px_100px_rgba(0,0,0,.28)] sm:p-5">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2a2a31] bg-[#0e0e10] px-2.5 py-1.5"><img src="/agents/ben-hathaway.png" alt="" className="h-6 w-6 rounded-full border border-[#3ecf8e]/40 object-cover" /><span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#5a5a62]">Agent analysis</span><span className="text-[11px] font-bold text-[#3ecf8e]">Ben</span></div>
      <div className="rounded-[12px] border border-[#2a2a31] bg-[#0e0e10] p-4">
        <div className="flex items-end justify-between gap-4 border-b border-[#1f1f24] pb-3">
          <div className="flex items-center gap-4"><Price label="Now" value="$182.40" /><span className="text-[#4a4a52]">→</span><Price label="AI target · 12mo" value="$213.00" green /></div>
          <div className="text-right"><div className="font-mono text-[21px] font-bold text-[#3ecf8e]">+16.8%</div><div className="text-[8.5px] font-bold uppercase tracking-[0.06em] text-[#65656d]">implied upside</div></div>
        </div>
        <p className="mt-3 text-[11.5px] leading-[1.5] text-[#777780]">Owner-earnings growth still outpaces price—moat intact, reinvestment runway wide open.</p>
      </div>
      <div className="my-4 flex items-center gap-4"><ScoreRing score={83} /><div><span className="inline-block rounded-[7px] border border-[#3ecf8e] px-2.5 py-1 font-mono text-[12px] font-bold tracking-[0.05em] text-[#3ecf8e]">BUY</span><h3 className="mt-2.5 text-[16px] font-bold">Compounding quietly through the noise</h3><p className="mt-1.5 text-[11.5px] leading-[1.5] text-[#8c8c95]">Cash generation is accelerating faster than the market is pricing in—a decade-hold setup, not a trade.</p></div></div>
      <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#65656d]">AI scorecard · 0–100</div>
      <ScoreRow score={87} title="Moat & cash generation" body="Free cash flow margin expanding; pricing power intact" color="#3ecf8e" />
      <ScoreRow score={64} title="Valuation vs. quality" body="Fair, not cheap—patience helps, not required" color="#f5c451" />
      <div className="mt-3 text-right font-mono text-[10px] text-[#3ecf8e]">— Ben</div>
    </article>
  );
}

function ScoreRing({ score }: { score: number }) { return <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full p-[7px]" style={{ background: `conic-gradient(#3ecf8e ${score}%, #23232a 0)` }}><div className="grid h-full w-full place-items-center rounded-full bg-[#101113] text-center"><div><div className="font-mono text-[20px] font-bold leading-none text-[#3ecf8e]">{score}</div><div className="mt-1 text-[8px] text-[#777780]">Agent view</div></div></div></div>; }
function ScoreRow({ score, title, body, color }: { score: number; title: string; body: string; color: string }) { return <div className="mt-2 flex items-center gap-3 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-2.5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full p-[5px]" style={{ background: `conic-gradient(${color} ${score}%, #23232a 0)` }}><div className="grid h-full w-full place-items-center rounded-full bg-[#101113] font-mono text-[11px] font-bold" style={{ color }}>{score}</div></div><div><div className="text-[11.5px] font-semibold">{title}</div><div className="mt-0.5 text-[10px] text-[#777780]">{body}</div></div></div>; }
function Price({ label, value, green = false }: { label: string; value: string; green?: boolean }) { return <div><div className="text-[8.5px] font-bold uppercase tracking-[0.05em] text-[#777780]">{label}</div><div className={`mt-1 font-mono text-[16px] font-semibold sm:text-[18px] ${green ? "text-[#3ecf8e]" : ""}`}>{value}</div></div>; }
function Stat({ value, label }: { value: string; label: string }) { return <div><div className="font-mono text-[20px] font-bold">{value}</div><div className="mt-0.5 text-[11px] font-medium text-[#5a5a62]">{label}</div></div>; }
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="text-center"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5a5a62]">{eyebrow}</div><h2 className="mt-2 text-[27px] font-extrabold tracking-[-0.03em]">{title}</h2></div>; }
function FeatureCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) { return <article className="flex flex-col rounded-[14px] border border-[#2a2a31] bg-[#161619] p-5"><h3 className="text-[15px] font-bold">{title}</h3><p className="mt-2 min-h-[60px] text-[12px] leading-[1.55] text-[#8c8c95]">{body}</p><div className="mt-4 flex-1 rounded-[10px] border border-[#232329] bg-[#0e0e10] p-3.5">{children}</div></article>; }
function DailyBriefDemo() { return <><p className="text-[10.5px] text-[#777780]">3 positions need a decision today.</p><div className="mt-2 flex gap-1.5"><Badge color="#f2575c">3 sell</Badge><Badge color="#f5c451">5 watch</Badge><Badge color="#3ecf8e">12 chill</Badge></div><div className="mt-3 rounded-[8px] border border-[#26262c] bg-[#151518] p-2.5"><div className="flex items-center gap-2"><b className="font-mono text-[13px]">PTT.BK</b><Badge color="#f5c451">Watch</Badge></div><p className="mt-1 text-[11px] font-semibold">Hold: earnings in 4 days</p></div></>; }
function TimingDemo() { return <><div className="flex flex-wrap gap-2 text-[9.5px] text-[#777780]"><span>🟡 Ex-dividend</span><span>🔵 Payment</span></div><div className="mt-3 rounded-[8px] border border-[#26262c] bg-[#151518] p-2.5"><div className="flex items-center justify-between gap-2"><b className="font-mono text-[13px]">ADVANC.BK</b><Badge color="#3ecf8e">Good entry</Badge></div><p className="mt-1.5 text-[10.5px] leading-[1.5] text-[#777780]">Ex-div in 6 days · post-ex dip favored adding within 3 sessions in 8 of 10 cycles.</p></div></>; }
function SignalDemo() { return <div className="flex items-center gap-3"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-[13px] border border-[#3ecf8e]/50"><div className="text-center"><div className="font-mono text-[19px] font-extrabold leading-none text-[#3ecf8e]">78</div><div className="mt-1 text-[7px] uppercase text-[#777780]">setup</div></div></div><div><Badge color="#3ecf8e">Buy dip</Badge><p className="mt-2 text-[11.5px] font-semibold leading-[1.45]">NVDA pulled back into support on light volume.</p></div></div>; }
function Badge({ color, children }: { color: string; children: React.ReactNode }) { return <span className="inline-block rounded-[5px] border px-1.5 py-0.5 font-mono text-[8.5px] font-bold" style={{ color, borderColor: `${color}66`, background: `${color}18` }}>{children}</span>; }
function ReplayMetric({ label, value, color }: { label: string; value: string; color: string }) { return <div className="rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-4"><div className="text-[9px] font-bold uppercase tracking-[0.05em] text-[#777780]">{label}</div><div className="mt-2 font-mono text-[23px] font-bold" style={{ color }}>{value}</div></div>; }
