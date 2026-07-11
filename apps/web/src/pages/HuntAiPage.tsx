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
      <ProPromoBanner open={hunt.trialModalOpen} signedIn={hunt.signedIn} onClose={hunt.closeTrialModal} onRedeem={hunt.redeemPremium} redeeming={hunt.redeemingPremium} />
      {hunt.signedIn ? <UsageBar hunt={hunt} /> : null}
      <WatchlistBar hunt={hunt} />
      <HuntTabsBar hunt={hunt} />
      {hunt.tab === "signals" ? <SignalsTab hunt={hunt} /> : null}
      {hunt.tab === "brief" ? <DailyBriefTab hunt={hunt} /> : null}
      {hunt.tab === "timing" ? hunt.premium ? <BuyTimingTab hunt={hunt} /> : <LockedTrialCard title="Buy Timing" onUnlock={hunt.unlockPremium} /> : null}
      {hunt.tab === "replay" ? hunt.premium ? <BacktradeTab hunt={hunt} /> : <LockedTrialCard title="AI Replay" onUnlock={hunt.unlockPremium} /> : null}
      {hunt.aiError ? <ErrorCard message={hunt.aiError} /> : null}
      {hunt.tab === "analyst" ? <AnalystTab hunt={hunt} /> : null}
    </section>
  );
}

function UsageBar({ hunt }: { hunt: ReturnType<typeof useHuntAi> }) {
  const expiry = hunt.premiumExpiresAt ? new Date(hunt.premiumExpiresAt) : null;
  const expiryLabel = expiry && !Number.isNaN(expiry.getTime()) ? expiry.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[#25252b] bg-[#121215] px-3 py-2 text-[10.5px] text-[#8c8c95]">
      <span className={`font-bold uppercase tracking-[0.06em] ${hunt.premium ? "text-[#3ecf8e]" : "text-[#f5c451]"}`}>{hunt.premium ? "Pro trial" : "Free plan"}</span>
      <span>{hunt.aiUsage.remaining} of {hunt.aiUsage.limit} AI runs left this month</span>
      {hunt.premium && expiryLabel ? <span>· Trial ends {expiryLabel}</span> : null}
      {!hunt.premium ? <button type="button" onClick={hunt.unlockPremium} className="ml-auto rounded-[6px] bg-[#3ecf8e] px-2.5 py-1 font-bold text-[#07110c]">Claim 30 days free</button> : null}
    </div>
  );
}

function LockedTrialCard({ title, onUnlock }: { title: string; onUnlock: () => void }) {
  return (
    <div className="rounded-[12px] border border-[#3ecf8e]/25 bg-[linear-gradient(135deg,rgba(62,207,142,0.07),rgba(116,164,255,0.04))] px-6 py-9 text-center">
      <div className="text-[19px] font-bold text-[#ececee]">{title} is included in Pro</div>
      <div className="mx-auto mt-2 max-w-[430px] text-[12.5px] leading-[1.6] text-[#8c8c95]">Activate the launch offer for 30 days free. No card required; the trial ends automatically.</div>
      <button type="button" onClick={onUnlock} className="mt-4 rounded-[9px] bg-[#3ecf8e] px-5 py-2.5 text-[12.5px] font-bold text-[#07110c] hover:opacity-90">Start free Pro month</button>
    </div>
  );
}
