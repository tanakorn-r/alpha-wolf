import { useEffect, useState } from "react";

export type AgentThinkingStep = { label: string; sub: string };

export function AgentThinking({ title, subtitle, marker = "AI", accent = "#3ecf8e", steps, workingLabel = "WORKING", onClose }: {
  title: string;
  subtitle: string;
  marker?: string;
  accent?: string;
  steps: AgentThinkingStep[];
  workingLabel?: string;
  onClose?: () => void;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
    const timer = window.setInterval(() => setTick((current) => current + 1), 900);
    return () => window.clearInterval(timer);
  }, [title]);

  const stepIndex = Math.min(steps.length - 1, Math.floor(tick / 3));
  const percent = Math.min(89, Math.round(6 + (1 - Math.exp(-tick / 11)) * 83));

  return (
    <section className="relative overflow-hidden rounded-[var(--aw-radius-card)] border bg-[linear-gradient(180deg,#17171b,#131316)] px-5 py-4" style={{ borderColor: `${accent}45` }} role="status" aria-live="polite">
      <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full blur-2xl" style={{ background: `${accent}18` }} />
      <div className="relative flex items-center gap-3.5">
        <div className="relative h-10 w-10 flex-none">
          <div className="absolute inset-0 animate-spin rounded-full border-[2.5px] border-transparent" style={{ borderTopColor: accent }} />
          <div className="absolute inset-[6px] animate-[spin_1.3s_linear_infinite_reverse] rounded-full border-2 border-transparent border-t-[#74a4ff]" />
          <div className="absolute inset-0 grid place-items-center px-1 text-center font-mono text-[10px] font-extrabold text-[#ececee]">{marker}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-[#ececee]">{title}</div>
          <div className="mt-0.5 text-[11.5px] text-[#8c8c95]">{subtitle}</div>
        </div>
        <div className="font-mono text-[16px] font-bold" style={{ color: accent }}>{percent}%</div>
        {onClose ? (
          <button type="button" onClick={onClose} className="rounded-[var(--aw-radius-chip)] border border-[#2a2a31] bg-[#0e0e10] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8c8c95] hover:text-[#ececee]">
            Close
          </button>
        ) : null}
      </div>
      <div className="my-3 h-1 overflow-hidden rounded-full bg-[#232329]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${percent}%`, background: `linear-gradient(90deg,${accent},#74a4ff)` }} />
      </div>
      <div className="grid gap-1">
        {steps.map((step, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <div key={step.label} className="flex items-center gap-3 rounded-[8px] px-1 py-1.5">
              <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full border text-[10px] font-bold" style={{ borderColor: done || active ? accent : "#2a2a31", color: done || active ? accent : "#5a5a62", background: done ? `${accent}18` : "transparent" }}>{done ? "✓" : active ? "•" : ""}</span>
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] font-medium ${index > stepIndex ? "text-[#5a5a62]" : "text-[#ececee]"}`}>{step.label}</div>
                {active ? <div className="mt-0.5 font-mono text-[10px] text-[#8c8c95]">{step.sub}</div> : null}
              </div>
              {active ? <span className="animate-pulse font-mono text-[9px]" style={{ color: accent }}>{workingLabel}</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
