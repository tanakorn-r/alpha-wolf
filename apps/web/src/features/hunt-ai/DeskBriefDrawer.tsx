import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import { useDialogAccessibility } from "../../lib/useDialogAccessibility";
import { DailyBriefTab } from "./DailyBriefTab";
import type { HuntAi } from "./useHuntAi";

export function DeskBriefDrawer({ hunt, onClose }: { hunt: HuntAi; onClose: () => void }) {
  const titleId = useId();
  const drawerRef = useDialogAccessibility<HTMLElement>(onClose);

  useEffect(() => lockBodyScroll(), []);

  return createPortal(
    <div className="fixed inset-0 z-[90] isolate flex justify-end bg-black/70 backdrop-blur-[2px]">
      <button type="button" aria-label="Close desk brief drawer" tabIndex={-1} onClick={onClose} className="absolute inset-0" />
      <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative flex h-[100dvh] w-full max-w-[1120px] flex-col overflow-hidden border-l border-[#34343c] bg-[#101012] shadow-[-28px_0_80px_rgba(0,0,0,.55)] outline-none">
        <header className="flex flex-none items-center justify-between gap-4 border-b border-[#29292f] bg-[#151518] px-4 py-3.5 min-[640px]:px-5">
          <div className="min-w-0">
            <div className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-[#3ecf8e]">Live research · one-day horizon</div>
            <h2 id={titleId} className="mt-0.5 text-[17px] font-black tracking-[-0.25px] text-[#ececee]">Today’s impact brief</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 flex-none place-items-center rounded-[8px] border border-[#34343c] bg-[#0e0e10] text-[18px] leading-none text-[#8c8c95] hover:border-[#3ecf8e]/50 hover:text-[#ececee]">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5 pb-[calc(1rem+var(--aw-safe-bottom))] min-[640px]:p-5">
          <DailyBriefTab hunt={hunt} />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
