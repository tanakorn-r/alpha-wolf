import { DailyBriefView } from "../features/daily-brief/DailyBriefView";
import { useDailyBrief } from "../features/daily-brief/useDailyBrief";

export function DailyBriefPage() {
  const brief = useDailyBrief();
  return (
    <section className="text-[#ececee]">
      <DailyBriefView brief={brief} />
    </section>
  );
}
