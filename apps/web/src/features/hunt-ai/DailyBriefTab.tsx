import { PremiumAiButton } from "../../components/PremiumAiButton";
import { DailyBriefView } from "../daily-brief/DailyBriefView";
import { useDailyBrief } from "../daily-brief/useDailyBrief";
import type { HuntAi } from "./useHuntAi";

export function DailyBriefTab({ hunt }: { hunt: HuntAi }) {
  const brief = useDailyBrief();

  if (!hunt.premium) {
    return (
      <div className="rounded-[14px] p-[2px]" style={{ background: "linear-gradient(135deg,#3ecf8e,#74a4ff,#c77dff)" }}>
        <div className="flex flex-col items-center gap-4 rounded-[12px] bg-[#0a0c0f] px-6 py-8 text-center">
          <div>
            <div className="mb-2 text-[20px] font-bold" style={{ background: "linear-gradient(90deg,#3ecf8e,#74a4ff,#c77dff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Daily Brief</div>
            <div className="mx-auto max-w-[420px] text-[12.5px] leading-[1.6] text-[#8c8c95]">Ask the desk what deserves attention today, then run Analyst on each holding that needs a deeper read.</div>
          </div>
          <PremiumAiButton label="Unlock Daily Brief" sublabel="Pro feature" onClick={hunt.unlockPremium} size="wide" />
        </div>
      </div>
    );
  }

  return <DailyBriefView brief={brief} />;
}
