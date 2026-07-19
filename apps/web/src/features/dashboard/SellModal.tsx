import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Money } from "../../components/Money";
import { Modal } from "../../components/ui/Modal";
import { formatCurrency, priceToUsdBase } from "../../lib/format";
import type { Dashboard } from "./useDashboard";
import { localDateKey } from "../../lib/date";

export function SellModal({ dash }: { dash: Dashboard }) {
  const holding = dash.sellTarget;
  if (!holding) return null;
  const form = dash.sellForm;
  const shares = Math.min(Number(form.value.shares || 0), holding.shares);
  const executionPrice = Number(form.value.price || 0);
  const feesNative = Number(form.value.fees || 0);
  const proceeds = shares * priceToUsdBase(executionPrice, holding.currency ?? holding.symbol, dash.portfolio?.fxRates) - priceToUsdBase(feesNative, holding.currency ?? holding.symbol, dash.portfolio?.fxRates);
  const estimatedBasis = fifoBasis(dash.portfolio?.transactions ?? [], holding.symbol, form.value.occurredAt, shares, holding.currency ?? holding.symbol, dash.portfolio?.fxRates, holding.shares > 0 ? holding.cost / holding.shares : holding.averageCost);
  const estimatedPnl = proceeds - estimatedBasis;
  return (
    <Modal title={`Record sale · ${holding.symbol}`} onClose={dash.cancelSell}>
      <p className="text-[13px] leading-[1.6] text-[#bcbcc2]">
        Record the actual units and execution price. This updates your position and calculates realized P/L using FIFO lots; it does not place a broker order.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label={`Units sold · max ${holding.shares}`} type="number" value={form.value.shares} min="0" max={String(holding.shares)} step="any" onChange={(value) => form.set("shares", value)} />
        <Field label="Execution price" type="number" value={form.value.price} min="0" step="any" onChange={(value) => form.set("price", value)} />
        <Field label="Sale date" type="date" value={form.value.occurredAt} max={localDateKey()} onChange={(value) => form.set("occurredAt", value)} />
        <Field label="Fees" type="number" value={form.value.fees} min="0" step="any" onChange={(value) => form.set("fees", value)} />
      </div>
      <div className="mt-4 overflow-hidden rounded-[11px] border border-[#2a2a31]">
        <Row label="Current quote" value={formatCurrency(holding.price, holding.currency)} />
        <Row label="Estimated FIFO P/L" value={<Money value={estimatedPnl} />} color={estimatedPnl >= 0 ? "#3ecf8e" : "#f2575c"} />
        <div className="flex items-center justify-between bg-[#121215] px-[15px] py-[14px]">
          <span className="font-semibold">Estimated proceeds</span>
          <span className="font-mono text-[17px] font-semibold text-[#3ecf8e]"><Money value={proceeds} /></span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
        <button type="button" disabled={dash.selling} onClick={dash.cancelSell} className="flex-1 rounded-[10px] border border-[#2a2a31] py-3 text-[13.5px] font-medium hover:border-[#8c8c95] disabled:opacity-60">
          Cancel
        </button>
        <button type="button" disabled={dash.selling} onClick={() => void dash.confirmSell()} className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#f2575c] py-3 text-[13.5px] font-bold text-[#1a0608] hover:bg-[#e04349] disabled:opacity-60">
          {dash.selling ? <LoadingSpinner size={14} /> : null}{shares >= holding.shares ? "Record full sale" : "Record partial sale"}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, type, value, onChange, min, max, step }: { label: string; type: "number" | "date"; value: string; onChange: (value: string) => void; min?: string; max?: string; step?: string }) {
  return (
    <label className="grid min-w-0 gap-1 text-[10px] uppercase tracking-[0.5px] text-[#8c8c95]">
      {label}
      <input required type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} className="h-10 w-full min-w-0 rounded-[8px] border border-[#34343c] bg-[#0e0e10] px-3 font-mono text-[12px] text-[#ececee] outline-none focus:border-[#f2575c]" />
    </label>
  );
}

function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-[#1f1f24] px-[15px] py-3 text-[13px] first:border-t-0">
      <span className="text-[#8c8c95]">{label}</span>
      <span className="font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

function fifoBasis(transactions: NonNullable<Dashboard["portfolio"]>["transactions"], symbol: string, throughDate: string, requestedShares: number, currencyOrSymbol: string, rates: Record<string, number> | undefined, fallbackUnitCost: number) {
  const lots: Array<[number, number]> = [];
  const ordered = transactions
    .filter((item) => item.symbol === symbol && item.occurredAt.slice(0, 10) <= throughDate)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id);
  for (const transaction of ordered) {
    if (transaction.kind === "BUY" && transaction.shares > 0) {
      const nativeCost = transaction.shares * transaction.nativePrice + transaction.nativeFees;
      lots.push([transaction.shares, nativeCost / transaction.shares]);
    } else if (transaction.kind === "SELL") {
      consume(lots, transaction.shares);
    }
  }
  const basis = consume(lots, requestedShares);
  const covered = Math.min(requestedShares, Math.max(0, ordered.reduce((sum, item) => sum + (item.kind === "BUY" ? item.shares : item.kind === "SELL" ? -item.shares : 0), 0)));
  return priceToUsdBase(basis, currencyOrSymbol, rates) + Math.max(0, requestedShares - covered) * fallbackUnitCost;
}

function consume(lots: Array<[number, number]>, requestedShares: number) {
  let remaining = requestedShares;
  let basis = 0;
  while (remaining > 1e-9 && lots.length) {
    const [lotShares, unitCost] = lots[0];
    const used = Math.min(remaining, lotShares);
    basis += used * unitCost;
    remaining -= used;
    if (used >= lotShares - 1e-9) lots.shift();
    else lots[0][0] = lotShares - used;
  }
  return basis;
}
