import { formatCurrency } from "../../lib/format";

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | null;
  color?: string;
  stroke?: string;
  payload?: Record<string, unknown>;
};

export type TooltipRow = [string, string, string?] | null | false | undefined;

export function PremiumChartTooltip({
  active,
  payload,
  label,
  currency,
  labels,
  extras = [],
  getExtraRows,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  currency: string;
  labels: Record<string, string>;
  extras?: TooltipRow[];
  getExtraRows?: (point?: Record<string, unknown>) => TooltipRow[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload)?.payload;
  const rows = payload
    .filter((item) => typeof item.value === "number" && Number.isFinite(item.value))
    .map((item): [string, string, string] => {
      const key = String(item.dataKey ?? item.name ?? "");
      return [
        labels[key] ?? String(item.name ?? key),
        formatCurrency(Number(item.value), currency),
        item.color ?? item.stroke ?? "#8c8c95",
      ];
    });
  const contextualRows = [...extras, ...(getExtraRows?.(point) ?? [])].filter(Boolean) as Array<[string, string, string?]>;

  if (!rows.length && !contextualRows.length) return null;
  return (
    <div className="min-w-[190px] rounded-[12px] border border-[#34343d] bg-[#0b0d10]/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-[#24242a] pb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#8c8c95]">Inspect</span>
        <span className="font-mono text-[11px] font-semibold text-[#ececee]">{label}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[...rows, ...contextualRows].map(([name, value, color], index) => (
          <div key={`${name}-${index}`} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-[11px] text-[#8c8c95]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color ?? "#8c8c95" }} />
              {name}
            </span>
            <span className="font-mono text-[11.5px] font-bold text-[#ececee]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
