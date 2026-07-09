import { ErrorCard } from "../components/ui/panels";
import { AnalystTab } from "../features/hunt-ai/AnalystTab";
import { BuyTimingTab } from "../features/hunt-ai/BuyTimingTab";
import { HuntTabsBar } from "../features/hunt-ai/HuntTabsBar";
import { IntradayTab } from "../features/hunt-ai/IntradayTab";
import { Next100Tab } from "../features/hunt-ai/Next100Tab";
import { SignalsTab } from "../features/hunt-ai/SignalsTab";
import { StrategyTab } from "../features/hunt-ai/StrategyTab";
import { WatchlistBar } from "../features/hunt-ai/WatchlistBar";
import { useHuntAi } from "../features/hunt-ai/useHuntAi";

export function HuntAiPage() {
  const hunt = useHuntAi();
  return (
    <section className="flex flex-col gap-4 text-[#ececee]">
      <WatchlistBar hunt={hunt} />
      <HuntTabsBar hunt={hunt} />
      {hunt.tab === "signals" ? <SignalsTab hunt={hunt} /> : null}
      {hunt.tab === "timing" ? <BuyTimingTab hunt={hunt} /> : null}
      {hunt.tab === "intraday" ? <IntradayTab hunt={hunt} /> : null}
      {hunt.tab === "n100" ? <Next100Tab hunt={hunt} /> : null}
      {hunt.aiError ? <ErrorCard message={hunt.aiError} /> : null}
      {hunt.tab === "strategy" ? <StrategyTab hunt={hunt} /> : null}
      {hunt.tab === "analyst" ? <AnalystTab hunt={hunt} /> : null}
    </section>
  );
}
