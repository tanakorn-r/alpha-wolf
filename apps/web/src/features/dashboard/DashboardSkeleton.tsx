// Mirrors DashboardPage's real body structure (same gap and section order/heights) so the
// swap from skeleton to real content doesn't reflow the page — a shape mismatch here is
// exactly what causes a visible "blink" on every load, even once loading itself is fast.
// The page's own heading renders unconditionally around this — it never depends on the
// fetch, so it should never be part of what gets replaced.
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="skeleton-block h-[190px]" />
      <div className="grid grid-cols-1 gap-[10px] min-[420px]:grid-cols-2 min-[800px]:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-block h-[84px]" />)}
      </div>
      <div className="skeleton-block h-[210px]" />
      <div className="skeleton-block h-[144px]" />
      <div className="grid items-start gap-[14px] min-[980px]:grid-cols-[1.35fr_.95fr]">
        <div className="skeleton-block h-[320px]" />
        <div className="skeleton-block h-[320px]" />
      </div>
    </div>
  );
}
