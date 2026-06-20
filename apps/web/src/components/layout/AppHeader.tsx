import { useLocation } from "react-router-dom";

export function AppHeader() {
  const location = useLocation();
  const page = location.pathname === "/scanner"
    ? { title: "DCA Scanner", subtitle: "Search any stock, then tap for an AI buy / wait verdict" }
    : location.pathname === "/calendar"
      ? { title: "Income Calendar", subtitle: "When your dividend money actually lands" }
      : { title: "Strategy Dashboard", subtitle: "Everything happening with your money, in one view" };

  return (
    <header className="aw-header sticky top-0 z-10 flex items-end justify-between gap-4 border-b border-[#2a2a31] px-7 pb-[18px] pt-[22px]">
      <div><h1 className="m-0 text-[21px] font-bold tracking-[-0.4px] text-[#ececee]">{page.title}</h1><p className="mt-[3px] text-[13px] text-[#8c8c95]">{page.subtitle}</p></div>
      <span className="font-mono text-xs text-[#5a5a62]">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
    </header>
  );
}
