import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";

export function HuntHero() {
  return (
    <div className="aw-rainbow-border rounded-2xl p-[2px]">
      <div className="flex items-center gap-[22px] rounded-[14px] bg-[#0d0f11] px-7 py-[26px] max-[720px]:flex-col max-[720px]:items-start">
        <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-[14px] bg-[#08090b]">
          <img src={alphaWolfIcon} alt="AlphaWolf" className="h-14 w-14 object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-[5px] flex items-center gap-2.5">
            <span className="aw-rainbow-text text-[19px] font-bold tracking-[-0.3px]">Hunt AI</span>
            <span className="rounded-[5px] bg-gradient-to-r from-[#3ecf8e] via-[#4d96ff] to-[#c77dff] px-2 py-[3px] text-[9px] font-bold tracking-[0.7px] text-white">PREMIUM</span>
          </div>
          <div className="text-[13px] leading-[1.55] text-[#bcbcc2]">Buy timing, next-10 forecasts, strategy playbooks and full analyst reads from live market data.</div>
        </div>
        <div className="flex-none text-right max-[720px]:text-left">
          <div className="text-[11px] text-[#8c8c95]">Last updated</div>
          <div className="mt-0.5 font-mono text-[13px] font-semibold">Live cache</div>
          <div className="mt-[7px] flex items-center justify-end gap-[5px] max-[720px]:justify-start">
            <span className="aw-pulse-dot" />
            <span className="text-[11px] text-[#3ecf8e]">Live</span>
          </div>
        </div>
      </div>
    </div>
  );
}
