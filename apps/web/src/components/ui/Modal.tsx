import { useEffect } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] min-[560px]:items-center min-[560px]:p-4">
      <button type="button" aria-label="Close modal" onClick={onClose} className="absolute inset-0" />
      <div className="aw-modal-panel relative flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[#34343c] bg-[#161619] shadow-2xl min-[560px]:rounded-xl">
        <div className="flex flex-none items-center justify-between border-b border-[#2a2a31] px-5 py-4">
          <h2 className="min-w-0 pr-4 font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-[#2a2a31] bg-[#0e0e10] text-[18px] leading-none text-[#8c8c95]" aria-label="Close">
            ×
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
