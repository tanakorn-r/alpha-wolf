import { LoadingSpinner } from "../../components/LoadingSpinner";

export const panel = "rounded-xl border border-[#2a2a31] bg-[#161619]";

export function SpinnerOrb() {
  return (
    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#0e0e10]">
      <div className="h-[16px] w-[16px] animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />
    </div>
  );
}

export function PremiumLoading({ title }: { title: string }) {
  return (
    <div className={`${panel} flex flex-col items-center justify-center gap-5 px-10 py-[52px] text-center`}>
      <div className="relative h-[58px] w-[58px]">
        <div className="absolute inset-0 animate-spin rounded-full border-[2.5px] border-transparent border-t-[#3ecf8e]" />
        <div className="absolute inset-2 animate-[spin_1.3s_linear_infinite_reverse] rounded-full border-2 border-transparent border-t-[#4d96ff]" />
        <div className="absolute inset-4 animate-[spin_0.65s_linear_infinite] rounded-full border-2 border-transparent border-t-[#c77dff]" />
      </div>
      <div>
        <div className="mb-2 text-[16px] font-semibold tracking-[-0.01em]">{title}</div>
        <div className="text-[13px] leading-[1.7] text-[#8c8c95]">Reading price action · valuation · momentum · market context</div>
      </div>
    </div>
  );
}

export function ChartLoading({ label }: { label: string }) {
  return <div className="flex h-full items-center justify-center gap-2 text-sm text-[#8c8c95]"><LoadingSpinner size={16} />{label}</div>;
}

export function LoadingRow({ label }: { label: string }) {
  return <div className="flex items-center gap-2 border-t border-[#1a1a1e] px-3.5 py-3 text-[12px] text-[#8c8c95]"><LoadingSpinner size={12} />{label}</div>;
}

export function EmptyStrip({ label }: { label: string }) {
  return <div className="px-3.5 py-4 text-center text-[12px] text-[#8c8c95]">{label}</div>;
}
