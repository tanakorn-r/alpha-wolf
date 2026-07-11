import { HuntFilters } from "../features/stock-hunt/HuntFilters";
import { MatchList } from "../features/stock-hunt/MatchList";
import { RankBanner } from "../features/stock-hunt/RankBanner";
import { Top5Panel } from "../features/stock-hunt/Top5Panel";
import { useStockHunt } from "../features/stock-hunt/useStockHunt";

export function StockHuntPage() {
  const hunt = useStockHunt();
  return (
    <section className="flex flex-col gap-3 text-[#ececee]">
      <HuntFilters hunt={hunt} />
      {/* <RankBanner hunt={hunt} /> */}
      <Top5Panel hunt={hunt} />
      <MatchList hunt={hunt} />
    </section>
  );
}
