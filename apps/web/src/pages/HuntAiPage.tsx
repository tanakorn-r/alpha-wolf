import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorCard } from "../components/ui/panels";
import { AnalystTab } from "../features/hunt-ai/AnalystTab";
import { BuyTimingTab } from "../features/hunt-ai/BuyTimingTab";
import { BacktradeTab } from "../features/hunt-ai/BacktradeTab";
import { DailyBriefTab } from "../features/hunt-ai/DailyBriefTab";
import { HuntTabsBar } from "../features/hunt-ai/HuntTabsBar";
import { ProPromoBanner } from "../features/hunt-ai/ProPromoBanner";
import { SignalsTab } from "../features/hunt-ai/SignalsTab";
import { WatchlistBar } from "../features/hunt-ai/WatchlistBar";
import type { HuntTab } from "../features/hunt-ai/lib";
import { useHuntAi } from "../features/hunt-ai/useHuntAi";

const validTabs = new Set<HuntTab>(["signals", "brief", "timing", "replay", "analyst"]);

export function HuntAiPage() {
  const hunt = useHuntAi();
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get("tab") as HuntTab | null;

  useEffect(() => {
    if (queryTab && validTabs.has(queryTab) && hunt.tab !== queryTab) hunt.setTab(queryTab);
  }, [hunt, queryTab]);

  return (
    <section className="flex flex-col gap-3 text-[#ececee]">
      <ProPromoBanner active={hunt.premiumPromoActive} accountCreatedAt={hunt.accountCreatedAt} onRedeem={hunt.redeemPremium} redeeming={hunt.redeemingPremium} />
      <WatchlistBar hunt={hunt} />
      <HuntTabsBar hunt={hunt} />
      {hunt.tab === "signals" ? <SignalsTab hunt={hunt} /> : null}
      {hunt.tab === "brief" ? <DailyBriefTab hunt={hunt} /> : null}
      {hunt.tab === "timing" ? <BuyTimingTab hunt={hunt} /> : null}
      {hunt.tab === "replay" ? <BacktradeTab hunt={hunt} /> : null}
      {hunt.aiError ? <ErrorCard message={hunt.aiError} /> : null}
      {hunt.tab === "analyst" ? <AnalystTab hunt={hunt} /> : null}
    </section>
  );
}
