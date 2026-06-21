import { useLocation } from "react-router-dom";
import { useWolfStore, type Currency } from "../../store/useWolfStore";

export function AppHeader() {
  const location = useLocation();
  const currency = useWolfStore((state) => state.currency);
  const setCurrency = useWolfStore((state) => state.setCurrency);
  const page = location.pathname === "/scanner"
    ? { title: "DCA Scanner", subtitle: "Search any stock, then tap for an AI buy / wait verdict" }
    : location.pathname === "/analyst"
      ? { title: "AI Analyst", subtitle: "Ask for a target price and make the upside impossible to miss" }
    : location.pathname === "/calendar"
      ? { title: "Income Calendar", subtitle: "When your dividend money actually lands" }
      : { title: "Strategy Dashboard", subtitle: "Everything happening with your money, in one view" };

  return (
    <header className="aw-header sticky top-0 z-10 flex items-end justify-between gap-4 border-b border-[#2a2a31] px-7 pb-[18px] pt-[22px]">
      <div><h1 className="m-0 text-[21px] font-bold tracking-[-0.4px] text-[#ececee]">{page.title}</h1><p className="mt-[3px] text-[13px] text-[#8c8c95]">{page.subtitle}</p></div>
      <div className="flex items-center gap-3.5">
        <div className="flex gap-0.5 rounded-lg border border-[#2a2a31] bg-[#161619] p-[3px]">
          {(["USD", "THB"] as Currency[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCurrency(option)}
              className={`rounded-md px-[11px] py-[5px] font-mono text-xs font-semibold ${currency === option ? "bg-[#1c1c20] text-[#3ecf8e]" : "text-[#8c8c95]"}`}
            >
              {option === "USD" ? "$ USD" : "฿ THB"}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-[#5a5a62]">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </header>
  );
}
