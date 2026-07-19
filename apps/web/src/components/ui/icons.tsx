export function SparkIcon({ className = "h-3.5 w-3.5 fill-[#3ecf8e]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d="m8 1.5 1.6 4.3L14 7 9.6 8.2 8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5Z" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="7" cy="7" r="4.5" stroke="#5a5a62" strokeWidth="1.4" />
      <path d="M10.5 10.5L14 14" stroke="#5a5a62" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ExploreIcon({ size = 17, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="m11.75 6.25-1.6 3.9-3.9 1.6 1.6-3.9 3.9-1.6Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <circle cx="9" cy="9" r=".8" fill="currentColor" />
    </svg>
  );
}

export function ArrowUpIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 13V4M4.5 7.5L8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type StrategyIconKind = "swing" | "day" | "long" | "value" | "fomo";

export function StrategyIcon({ kind, color = "currentColor", size = 15 }: { kind: StrategyIconKind; color?: string; size?: number }) {
  if (kind === "swing") {
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 11l3-4 3 3 3-5 3 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (kind === "day") {
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" fill={color} /><circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.3" /></svg>;
  }
  if (kind === "long") {
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 13V7l4 2.5L10 4l4 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (kind === "value") {
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M8 2v12M5 5.5l3-3 3 3M5 10.5l3 3 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.5 4L14 7l-4.5 1L8 12.5 6.5 8 2 7l4.5-1.5L8 1.5z" fill={color} /></svg>;
}
