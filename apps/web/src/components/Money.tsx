import { formatMoneyDual } from "../lib/format";

export function Money({ value, secondaryClassName }: { value?: number; secondaryClassName?: string }) {
  const { primary, secondary } = formatMoneyDual(value);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1.5">
      <span>{primary}</span>
      {secondary ? <span className={secondaryClassName ?? "text-[11px] font-normal text-[#5a5a62]"}>≈{secondary}</span> : null}
    </span>
  );
}
