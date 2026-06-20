export function ChartState({ state, onRetry }: { state: "loading" | "empty" | "error"; onRetry?: () => void }) {
  if (state === "loading") return <div className="skeleton-block h-full min-h-48" aria-label="Loading chart" />;
  return <div className="grid h-full min-h-48 place-items-center text-center text-sm text-[#8c8c95]"><div><p>{state === "empty" ? "No chart history is available yet." : "Chart data could not be loaded."}</p>{onRetry ? <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-[#3ecf8e] px-3 py-2 text-xs font-semibold text-[#3ecf8e]">Retry</button> : null}</div></div>;
}
