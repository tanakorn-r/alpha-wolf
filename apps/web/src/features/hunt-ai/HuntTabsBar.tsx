import type { HuntTab } from "./lib";
import type { HuntAi } from "./useHuntAi";

const tabs: Array<{ key: HuntTab; label: string; premium?: boolean; tag?: string; tone?: "live" | "ultra" | "pro" }> = [
  { key: "signals", label: "Signals" },
  { key: "brief", label: "Daily Brief", premium: true, tag: "PRO", tone: "pro" },
  { key: "timing", label: "Buy Timing", premium: true, tag: "PRO", tone: "pro" },
  { key: "replay", label: "AI Replay", premium: true, tag: "LAB", tone: "ultra" },
  { key: "analyst", label: "Analyst", premium: true, tag: "PRO", tone: "pro" },
];

export function HuntTabsBar({ hunt }: { hunt: HuntAi }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-[var(--aw-radius-control)] border border-[var(--aw-border)] bg-[#0e0e10] p-1 [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = hunt.tab === tab.key;
        // A badge on the tab you're already viewing is redundant — only flag tabs you haven't opened yet.
        const showTag = tab.premium && !active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => hunt.setTab(tab.key)}
            className={`flex flex-none items-center gap-1.5 rounded-[var(--aw-radius-chip)] px-3.5 py-2 text-[12.5px] font-medium transition-colors ${active ? "bg-[#1c1c20] text-[#ececee] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]" : "text-[#8c8c95] hover:bg-[#161619] hover:text-[#ececee]"}`}
          >
            <TabGlyph tab={tab.key} />
            {tab.label}
            {showTag ? <Tag tone={tab.tone ?? "pro"}>{tab.tag}</Tag> : null}
          </button>
        );
      })}
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
  if (tab === "brief") return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 3.5h10M3 7h7M3 10.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M12 7h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  if (tab === "timing") return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.7V8l2.4 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tab === "replay") return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M5.2 4H2.8v-2.4M3 4a5.8 5.8 0 1 1-1 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M6.5 6v4l3-2-3-2Z" fill="currentColor" /></svg>;
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.4" /><path d="M4 6h8M4 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}
