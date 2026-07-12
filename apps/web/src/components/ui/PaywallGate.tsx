import type { ReactNode } from "react";

export function PaywallGate({
  icon,
  title,
  description,
  ctaLabel,
  onUnlock,
  loading,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  onUnlock: () => void;
  loading?: boolean;
}) {
  return (
    <div className="rounded-[var(--aw-radius-card)] bg-[linear-gradient(120deg,#3ecf8e,#57a8ff_28%,#a78bfa_58%,#ff6bcb_78%,#ffd166_100%)] p-px">
      <div className="flex flex-col items-center gap-3 rounded-[14.5px] bg-[#0a0c0f] px-6 py-[26px] text-center">
        <div className="relative grid h-11 w-11 place-items-center rounded-[var(--aw-radius-control)] border border-[#74a4ff]/30 bg-[linear-gradient(145deg,rgba(62,207,142,0.14),rgba(157,123,255,0.14))] text-[#74a4ff]">
          {icon}
        </div>
        <div>
          <div className="mb-1.5 bg-gradient-to-r from-[#3ecf8e] via-[#74a4ff] to-[#c77dff] bg-clip-text text-[18px] font-extrabold text-transparent">{title}</div>
          <p className="mx-auto max-w-[360px] text-[12px] leading-[1.6] text-[#8c8c95]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onUnlock}
          disabled={loading}
          className="mt-1 rounded-[var(--aw-radius-control)] bg-[linear-gradient(120deg,#3ecf8e,#74a4ff,#c77dff)] px-[18px] py-[9px] text-[12.5px] font-extrabold text-[#06120c] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Activating…" : ctaLabel}
        </button>
      </div>
    </div>
  );
}
