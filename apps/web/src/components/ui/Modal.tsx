import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import { useDialogAccessibility } from "../../lib/useDialogAccessibility";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId();
  const dialogRef = useDialogAccessibility<HTMLDivElement>(onClose);
  useEffect(() => {
    const unlockBodyScroll = lockBodyScroll();
    return unlockBodyScroll;
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[80] isolate flex items-end justify-center overflow-hidden bg-black/70 px-3 pb-[calc(0.75rem+var(--aw-safe-bottom))] pt-[calc(0.75rem+var(--aw-safe-top))] min-[560px]:items-center min-[560px]:p-4">
      <button type="button" aria-label="Close modal" tabIndex={-1} onClick={onClose} className="absolute inset-0" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="aw-modal-panel relative flex max-h-[calc(100dvh-1.5rem-var(--aw-safe-top)-var(--aw-safe-bottom))] w-full min-w-0 max-w-md flex-col overflow-hidden rounded-t-[var(--aw-radius-frame)] border border-[#34343c] bg-[#161619] shadow-2xl outline-none min-[560px]:rounded-[var(--aw-radius-frame)]">
        <div className="flex flex-none items-center justify-between border-b border-[#2a2a31] px-5 py-4">
          <h2 id={titleId} className="min-w-0 pr-4 font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 flex-none place-items-center rounded-[var(--aw-radius-chip)] border border-[#2a2a31] bg-[#0e0e10] text-[18px] leading-none text-[#8c8c95]" aria-label="Close">
            ×
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 max-[420px]:p-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
