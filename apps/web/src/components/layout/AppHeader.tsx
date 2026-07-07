import { useLocation } from "react-router-dom";

export function AppHeader() {
  const location = useLocation();
  const page = location.pathname === "/scanner"
    ? { title: "DCA Scanner", subtitle: "Search any stock, then tap for an AI buy / wait verdict" }
    : location.pathname === "/daily-brief"
      ? { title: "Daily Brief", subtitle: "What moved, what pays, what needs action" }
    : location.pathname === "/live-trade"
      ? { title: "Live Trade", subtitle: "TradingView chart plus live US screener reads" }
    : location.pathname === "/hunt-ai"
      ? { title: "Hunt AI", subtitle: "Buy timing · live intraday · strategy desk · analyst reports · Next 10" }
    : location.pathname === "/calendar"
      ? { title: "Income Calendar", subtitle: "When your dividend money actually lands" }
      : { title: "Strategy Dashboard", subtitle: "Everything happening with your money, in one view" };

  return (
    <header className="aw-header sticky top-0 z-10 flex items-end justify-between gap-4 border-b border-[#2a2a31] px-7 pb-[18px] pt-[22px]">
      <div>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-[#2a2a31] bg-[#161619] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#3ecf8e]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3ecf8e]" />
          Alpha Wolf
        </div>
        <h1 className="m-0 text-[21px] font-bold tracking-[-0.4px] text-[#ececee]">{page.title}</h1>
        <p className="mt-[3px] text-[13px] text-[#8c8c95]">{page.subtitle}</p>
      </div>
      <span className="font-mono text-xs text-[#5a5a62]">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
    </header>
  );
}
