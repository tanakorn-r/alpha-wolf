import { HuntFilters } from "../features/stock-hunt/HuntFilters";
import { MatchList } from "../features/stock-hunt/MatchList";
import { useStockHunt } from "../features/stock-hunt/useStockHunt";
import { GoogleAccountModal } from "../components/auth/GoogleAccount";

export function StockHuntPage() {
  const hunt = useStockHunt();
  return (
    <section className="flex flex-col gap-3 text-[#ececee]">
      {hunt.signInOpen ? <GoogleAccountModal user={hunt.accountUser} onClose={hunt.closeSignIn} /> : null}
      <HuntFilters hunt={hunt} />
      <MatchList hunt={hunt} />
    </section>
  );
}
