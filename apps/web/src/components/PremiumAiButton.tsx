import alphaWolfIcon from "../assets/icons/alphawolf-icon.png";
import { LoadingSpinner } from "./LoadingSpinner";

type PremiumAiButtonProps = {
  label: string;
  sublabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  size?: "compact" | "normal" | "wide";
  type?: "button" | "submit";
};

export function PremiumAiButton({
  label,
  sublabel,
  onClick,
  disabled,
  loading,
  className = "",
  size = "normal",
  type = "button",
}: PremiumAiButtonProps) {
  const padding = size === "compact" ? "px-3 py-2.5" : size === "wide" ? "px-5 py-3.5" : "px-4 py-3";
  const tile = size === "compact" ? "h-8 w-8 rounded-[10px]" : "h-10 w-10 rounded-xl";
  const title = size === "compact" ? "text-[13px]" : "text-[15px]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`group relative inline-flex cursor-pointer overflow-hidden rounded-[16px] bg-[linear-gradient(120deg,#3ecf8e_0%,#57a8ff_28%,#a78bfa_58%,#ff6bcb_78%,#ffd166_100%)] bg-[length:220%_220%] bg-[position:0%_50%] p-[1.5px] text-left transition-[background-position,opacity,transform] duration-300 hover:-translate-y-0.5 hover:bg-[position:100%_50%] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 ${className}`}
    >
      <span className={`relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-[14.5px] bg-[#101113] ${padding} transition-colors duration-300 group-hover:bg-[#131519]`}>
        <span className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(157,123,255,0.10))] opacity-70 transition-opacity group-hover:opacity-100" />
        <span className={`relative grid flex-none place-items-center overflow-hidden border border-[#27363b] bg-[linear-gradient(145deg,rgba(62,207,142,0.14),rgba(157,123,255,0.13))] transition-colors group-hover:border-[#556075] ${tile}`}>
          {loading ? <LoadingSpinner size={size === "compact" ? 14 : 16} /> : <img src={alphaWolfIcon} alt="" className="h-full w-full object-cover opacity-95" />}
        </span>
        <span className="relative flex flex-col gap-0.5">
          <span className={`bg-gradient-to-r from-[#3ecf8e] via-[#74a4ff] to-[#c77dff] bg-clip-text font-black leading-tight text-transparent ${title}`}>{label}</span>
          {sublabel ? <span className="text-[11px] font-medium text-[#8c8c95] transition-colors group-hover:text-[#a6a6af]">{sublabel}</span> : null}
        </span>
      </span>
    </button>
  );
}
