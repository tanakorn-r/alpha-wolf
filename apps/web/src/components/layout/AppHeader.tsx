import { useLocation } from "react-router-dom";

export function AppHeader() {
  const location = useLocation();
  const page = location.pathname === "/scanner"
    ? { title: "Strategy Scanner", subtitle: "Track the market, rank the setup, and find the names worth stalking" }
    : location.pathname === "/analyst"
      ? { title: "AI Analyst", subtitle: "Ask Alpha Wolf for a real house view, not a recycled consensus" }
    : location.pathname === "/calendar"
      ? { title: "Income Calendar", subtitle: "Track ex-dates, payment dates, and the income rhythm across your book" }
      : { title: "Strategy Dashboard", subtitle: "Your money, your open plans, and the market context in one wolf view" };

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
