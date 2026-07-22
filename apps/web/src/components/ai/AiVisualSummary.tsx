export type VisualSegment = {
  label: string;
  value: number;
  color: string;
  icon?: string;
};

export function AiVisualSummary({ title, subtitle, segments }: { title: string; subtitle?: string; segments: VisualSegment[] }) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) return null;

  return (
    <section className="rounded-[10px] border border-white/[0.07] bg-black/20 px-3.5 py-3" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#8c8c95]">{title}</div>{subtitle ? <div className="mt-0.5 text-[9px] text-[#5f5f68]">{subtitle}</div> : null}</div>
        <span className="font-mono text-[9px] text-[#5f5f68]">{total} signals</span>
      </div>
      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
        {visible.map((segment) => <span key={segment.label} className="h-full transition-[width] duration-500" style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }} title={`${segment.label}: ${segment.value}`} />)}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 min-[620px]:flex min-[620px]:flex-wrap min-[620px]:gap-3">
        {visible.map((segment) => <div key={segment.label} className="flex items-center gap-1.5 text-[9px] text-[#8c8c95]"><span className="grid h-4 w-4 place-items-center rounded-[4px] text-[9px] font-black" style={{ color: segment.color, background: `${segment.color}16` }}>{segment.icon ?? "•"}</span><span>{segment.label}</span><b className="font-mono" style={{ color: segment.color }}>{segment.value}</b></div>)}
      </div>
    </section>
  );
}
