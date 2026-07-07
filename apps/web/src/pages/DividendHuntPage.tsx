import { CalendarCard } from "../features/dividend-hunt/CalendarCard";
import { CalendarSide } from "../features/dividend-hunt/CalendarSide";
import { useDividendHunt } from "../features/dividend-hunt/useDividendHunt";

export function DividendHuntPage() {
  const hunt = useDividendHunt();
  return (
    <div className="grid gap-4 text-[#ececee] xl:grid-cols-[1fr_340px]">
      <CalendarCard hunt={hunt} />
      <CalendarSide hunt={hunt} />
    </div>
  );
}
