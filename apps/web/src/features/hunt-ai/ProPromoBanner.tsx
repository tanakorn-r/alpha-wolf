import { useState } from "react";

const SEEN_STORAGE_KEY = "aw_seen_pro_promo";

function hasSeenPromo() {
  return typeof window !== "undefined" && window.localStorage.getItem(SEEN_STORAGE_KEY) === "1";
}

function markSeenPromo() {
  if (typeof window !== "undefined") window.localStorage.setItem(SEEN_STORAGE_KEY, "1");
}

function sinceLabel(accountCreatedAt: string | null) {
  const since = accountCreatedAt ? new Date(accountCreatedAt) : null;
  return since && !Number.isNaN(since.getTime())
    ? `Your account joined ${since.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} — redeem now for a free first month.`
    : "Redeem now for a free first month.";
}

export function ProPromoBanner({
  active,
  accountCreatedAt,
  onRedeem,
  redeeming,
}: {
  active: boolean;
  accountCreatedAt: string | null;
  onRedeem: () => void;
  redeeming: boolean;
}) {
  const [seen, setSeen] = useState(hasSeenPromo);
  const [closed, setClosed] = useState(false);
  if (!active || closed) return null;

  const dismiss = () => { markSeenPromo(); setSeen(true); };
  const redeem = () => { markSeenPromo(); setSeen(true); onRedeem(); };

  if (!seen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-[420px] rounded-[14px] border border-[#3ecf8e]/30 bg-[#111113] p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/10">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.8 4.5 4.7 1.5-4.7 1.2L8 14 6.2 8.7 1.5 7.5 6.2 6z" stroke="#3ecf8e" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </div>
          <div className="mt-3 text-[17px] font-bold text-[#ececee]">Hunt AI Pro is free right now</div>
          <p className="mx-auto mt-2 max-w-[340px] text-[12.5px] leading-[1.6] text-[#8c8c95]">
            Redeem it and every tab — Daily Brief, Buy Timing, AI Replay, Analyst — opens up at no cost.
            {" "}{sinceLabel(accountCreatedAt)}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" disabled={redeeming} onClick={redeem} className="rounded-[9px] bg-[#3ecf8e] px-4 py-2.5 text-[13px] font-bold text-[#0a0c0f] hover:opacity-90 disabled:opacity-60">
              {redeeming ? "Redeeming…" : "Redeem Free Pro"}
            </button>
            <button type="button" onClick={dismiss} className="rounded-[9px] border border-[#2a2a31] bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-[#8c8c95] hover:border-[#5a5a62]">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#3ecf8e]/30 bg-[linear-gradient(135deg,rgba(62,207,142,0.08),rgba(116,164,255,0.05))] px-4 py-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-[#3ecf8e]">Hunt AI Pro is free right now</div>
        <div className="mt-0.5 text-[11.5px] text-[#8c8c95]">{sinceLabel(accountCreatedAt)}</div>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" disabled={redeeming} onClick={redeem} className="rounded-[7px] bg-[#3ecf8e] px-3 py-1.5 text-[11px] font-bold text-[#0a0c0f] hover:opacity-90 disabled:opacity-60">
          {redeeming ? "Redeeming…" : "Redeem Free Pro"}
        </button>
        <button type="button" onClick={() => setClosed(true)} aria-label="Dismiss" className="rounded-[7px] border border-[#2a2a31] bg-[#161619] px-2.5 py-1.5 text-[11px] text-[#8c8c95] hover:border-[#5a5a62]">
          ×
        </button>
      </div>
    </div>
  );
}
