import { ArrowUpIcon } from "../../components/ui/icons";
import type { HuntTab } from "./lib";
import type { HuntAi } from "./useHuntAi";

const tabs: Array<{ key: HuntTab; label: string; tag?: string; tone?: "live" | "ultra" | "pro" }> = [
  { key: "signals", label: "Daily Signals" },
  { key: "timing", label: "Buy Timing", tag: "PRO", tone: "pro" },
  { key: "intraday", label: "Live Intraday", tag: "LIVE", tone: "live" },
  { key: "n100", label: "Next 10 ↑", tag: "PRO", tone: "ultra" },
  { key: "strategy", label: "FOMO + Strategy", tag: "PRO", tone: "pro" },
  { key: "analyst", label: "Analyst", tag: "PRO", tone: "pro" },
];

export function HuntTabsBar({ hunt }: { hunt: HuntAi }) {
  return (
    <div className="flex gap-[3px] overflow-x-auto rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-[3px] [scrollbar-width:none]">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => hunt.setTab(tab.key)}
          className={`flex flex-none items-center gap-[7px] rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${hunt.tab === tab.key ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95] hover:text-[#ececee]"}`}
        >
          <TabGlyph tab={tab.key} />
          {tab.label}
          {tab.tag ? <Tag tone={tab.tone ?? "pro"}>{tab.tag}</Tag> : null}
        </button>
      ))}
    </div>
  );
}

function Tag({ tone, children }: { tone: "live" | "ultra" | "pro"; children: React.ReactNode }) {
  const className = tone === "live"
    ? "bg-[#f2575c]"
    : "bg-gradient-to-r from-[#3ecf8e] via-[#4d96ff] to-[#c77dff]";
  return <span className={`rounded-[4px] px-[5px] py-px text-[8px] font-bold tracking-[0.5px] text-white ${className}`}>{children}</span>;
}

function TabGlyph({ tab }: { tab: HuntTab }) {
  if (tab === "signals") return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 11l3-4 3 3 4-6 2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tab === "timing") return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.7V8l2.4 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tab === "intraday") return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="1.8" fill="currentColor" /><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1" opacity="0.4" /></svg>;
  if (tab === "n100") return <ArrowUpIcon size={13} />;
  if (tab === "strategy") return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.5 4L14 7l-4.5 1L8 12.5 6.5 8 2 7l4.5-1.5L8 1.5z" stroke="currentColor" strokeWidth="1.4" /></svg>;
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.4" /><path d="M4 6h8M4 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}
