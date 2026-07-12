import { LoadingSpinner } from "../LoadingSpinner";
import { surfaceClasses } from "./Surface";

const panel = surfaceClasses.card;

export function LoadingPanel({ title, body }: { title: string; body?: string }) {
  return (
    <div className={`${panel} flex items-center gap-3 px-4 py-3.5 text-[#8c8c95]`}>
      <LoadingSpinner size={18} className="flex-none text-[#3ecf8e]" />
      <div>
        <div className="text-sm font-semibold text-[#ececee]">{title}</div>
        {body ? <div className="text-xs">{body}</div> : null}
      </div>
    </div>
  );
}

export function LoadingStrip({ label }: { label: string }) {
  return (
    <div className={`${panel} flex items-center gap-3 px-4 py-3 text-sm text-[#8c8c95]`}>
      <LoadingSpinner size={14} className="flex-none text-[#3ecf8e]" />
      {label}
    </div>
  );
}

export function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${panel} p-10 text-center`}>
      <div className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-[10px] bg-[#0e0e10] text-[#3ecf8e]">+</div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mx-auto mt-2 max-w-[420px] text-[12.5px] leading-[1.65] text-[#8c8c95]">{body}</div>
    </div>
  );
}

export function RetryPanel({ label, busy, onRetry }: { label: string; busy?: boolean; onRetry: () => void }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-xl border border-[#663438] bg-[#2c1719] p-5 text-center text-sm text-[#f2575c]">
      <span>{label}</span>
      <button type="button" disabled={busy} onClick={onRetry} className="flex items-center gap-2 rounded border border-[#f2575c] px-3 py-1.5 text-xs disabled:opacity-60">
        {busy ? <LoadingSpinner size={12} /> : null}
        Retry
      </button>
    </div>
  );
}

export function ErrorBanner({ message, busy, onRetry }: { message: string; busy?: boolean; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]">
      <span>{message}</span>
      <button type="button" disabled={busy} onClick={onRetry} className="flex items-center gap-2 rounded border border-[#f2575c] px-2 py-1 text-xs disabled:opacity-60">
        {busy ? <LoadingSpinner size={12} /> : null}
        Retry
      </button>
    </div>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return <div className="rounded-xl border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]">{message}</div>;
}
