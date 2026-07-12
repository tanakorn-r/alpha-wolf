import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";

export function EmptyPortfolio({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-[#2a2a31] bg-gradient-to-b from-[#15171a] to-[#0f1011] px-6 py-16 text-center">
      <div className="mb-5 grid h-[74px] w-[74px] place-items-center overflow-hidden rounded-2xl bg-[#08090b]">
        <img src={alphaWolfIcon} alt="AlphaWolf" className="h-full w-full object-cover opacity-95" />
      </div>
      <h2 className="text-[23px] font-bold tracking-[-0.4px]">Start your AlphaWolf book</h2>
      <p className="mt-[9px] max-w-[460px] text-sm leading-[1.6] text-[#8c8c95]">
        You don&apos;t own anything yet. Add a stock you&apos;ve bought — the units and the price you paid — and AlphaWolf tracks the value, the income, and the result.
      </p>
      <div className="mt-[30px] flex flex-wrap justify-center gap-3.5">
        <OnboardStep n="01" title="Add what you own" body="Enter the ticker, how many units you bought, and your buy price." />
        <OnboardStep n="02" title="Let it track" body="Position value, cost basis, and dividend dates update automatically." />
        <OnboardStep n="03" title="Ask the desk" body="Run any AlphaWolf agent on a holding for a buy / hold / trim read." />
      </div>
      <button type="button" onClick={onAdd} className="mt-[30px] flex items-center gap-2 rounded-lg bg-[#3ecf8e] px-6 py-[13px] text-sm font-bold text-[#06120c]">
        <span className="text-base leading-none">+</span> Add your first holding
      </button>
    </div>
  );
}

function OnboardStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="w-[200px] rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)] p-[18px] text-left">
      <div className="font-mono text-[13px] font-semibold text-[#3ecf8e]">{n}</div>
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-[1.5] text-[#8c8c95]">{body}</div>
    </div>
  );
}
