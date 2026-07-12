import { PaywallGate } from "../../components/ui/PaywallGate";
import { DailyBriefView } from "../daily-brief/DailyBriefView";
import { useDailyBrief } from "../daily-brief/useDailyBrief";
import type { HuntAi } from "./useHuntAi";

export function DailyBriefTab({ hunt }: { hunt: HuntAi }) {
  const brief = useDailyBrief();

  if (!hunt.premium) {
    return (
      <PaywallGate
        icon={<svg width="22" height="22" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.4" /><path d="M4 6h8M4 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>}
        title="Daily Brief"
        description="Ask the desk what deserves attention today, then run Analyst on each holding that needs a deeper read."
        ctaLabel="Unlock Daily Brief"
        onUnlock={hunt.unlockPremium}
      />
    );
  }

  return <DailyBriefView brief={brief} />;
}
