export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[5px] border border-[#2a2a31] px-[7px] py-0.5 text-[10px] text-[#8c8c95]">{children}</span>;
}

export function SignalChip({ good, children }: { good: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-[#2a2a31] bg-[#0e0e10] px-[9px] py-1 text-[11.5px] text-[#bcbcc2]">
      <span className={`h-1.5 w-1.5 rounded-full ${good ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`} />
      {children}
    </span>
  );
}

export function TagPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="rounded-[5px] border px-2 py-[2px] text-[10px] font-bold" style={{ borderColor: `${color}40`, color, background: `${color}12` }}>
      {label}
    </span>
  );
}
