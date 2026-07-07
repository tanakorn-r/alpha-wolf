import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Money } from "../../components/Money";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { Modal } from "../../components/ui/Modal";
import { formatMoneyBaht } from "../../lib/format";
import type { PlanCard as PlanCardState } from "./usePlanCard";

const input = "h-10 rounded-lg border border-[#34343c] bg-[#0e0e10] px-3 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function PlanCard({ plan }: { plan: PlanCardState }) {
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619] px-[18px] py-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">This month's plan</h2>
        <span className="text-[10px] uppercase tracking-[0.6px] text-[#5a5a62]">This month</span>
      </div>
      {plan.exDivAnchors.length ? (
        <p className="mt-1 text-[11px] text-[#5a5a62]">Built around {plan.exDivAnchors.join(" + ")} ex-dividend date{plan.exDivAnchors.length > 1 ? "s" : ""}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2.5 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-[14px] py-[13px]">
        <div className="min-w-0">
          <div className="text-[11px] text-[#8c8c95]">Cash to invest</div>
          <div className="mt-0.5 font-mono text-[23px] font-bold tracking-[-0.5px]">
            <Money value={plan.cashReserve} secondaryClassName="text-[12px] font-normal text-[#5a5a62]" />
          </div>
        </div>
        <button type="button" onClick={plan.showAddFunds} className="flex flex-none items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#161619] px-[13px] py-2 text-xs font-semibold text-[#3ecf8e] hover:border-[#3ecf8e]">
          <span className="text-base leading-none">+</span> Add funds
        </button>
      </div>

      <div className="mt-3 flex gap-[3px] rounded-lg border border-[#2a2a31] bg-[#0e0e10] p-[3px]">
        {plan.months.map((option) => (
          <button key={option.key} type="button" onClick={() => plan.setMonth(option.key)} className={`flex-1 rounded-md py-1.5 text-center text-xs font-medium ${plan.month === option.key ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95]"}`}>
            {option.label}
          </button>
        ))}
      </div>

      {plan.applied ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-[10px] border border-[#285f48] bg-[#173528] px-3.5 py-2.5 text-xs">
          <span className="text-[#3ecf8e]">
            Deployed {formatMoneyBaht(plan.applied.amount)} across {plan.applied.count} stock{plan.applied.count === 1 ? "" : "s"} at today&apos;s price — check your holdings below.
          </span>
          <button type="button" onClick={plan.dismissApplied} className="text-[#82b99f] hover:text-[#ececee]">Dismiss</button>
        </div>
      ) : null}

      <div className="mt-[13px] flex flex-col gap-[11px]">
        {plan.items.map((order) => (
          <div key={order.id} className="flex items-center gap-[9px]">
            <button type="button" onClick={() => plan.openDetail(order.symbol)} className="min-w-0 flex-1 text-left text-[13px] font-medium">{order.symbol}</button>
            <input
              key={`${order.id}-${formatShares(plan.orderShares(order))}`}
              defaultValue={formatShares(plan.orderShares(order))}
              onBlur={(event) => void plan.setShares(order, event.target.value)}
              disabled={plan.savingOrderId === order.id}
              placeholder="shares"
              className="w-[88px] flex-none rounded-md border border-[#2a2a31] bg-[#0e0e10] px-2 py-1 text-right font-mono text-[12.5px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
            />
            <span className="w-[28px] flex-none text-[10px] uppercase tracking-[0.08em] text-[#5a5a62]">sh</span>
            {plan.savingOrderId === order.id ? <LoadingSpinner size={14} className="text-[#8c8c95]" /> : null}
            <button
              type="button"
              disabled={plan.savingOrderId === order.id}
              onClick={() => void plan.remove(order)}
              className="grid h-[22px] w-[22px] flex-none place-items-center rounded-md border border-[#2a2a31] bg-[#0e0e10] text-[15px] leading-none text-[#8c8c95] hover:border-[#f2575c] hover:text-[#ececee] disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
        {!plan.items.length ? <div className="rounded-[9px] border border-dashed border-[#2a2a31] p-3.5 text-center text-xs text-[#8c8c95]">No stocks yet — add one below.</div> : null}
      </div>

      <button type="button" onClick={plan.toggleAdd} className="mt-[11px] flex w-full items-center justify-center gap-[7px] rounded-lg border border-dashed border-[#2a2a31] py-2.5 text-[13px] font-medium text-[#3ecf8e] hover:border-[#3ecf8e] hover:bg-[#3ecf8e]/5">
        <span className="text-base leading-none">{plan.addOpen ? "−" : "+"}</span>{plan.addOpen ? "Close" : "Add stock"}
      </button>

      {plan.addOpen ? (
        <div className="mt-2.5 overflow-hidden rounded-[10px] border border-[#2a2a31] bg-[#0e0e10]">
          <div className="p-2.5">
            <input autoFocus value={plan.addQuery} onChange={(event) => plan.setAddQuery(event.target.value)} placeholder="Search ticker or company…" className="w-full rounded-lg border border-[#2a2a31] bg-[#161619] px-[11px] py-[9px] text-[12.5px] text-[#ececee] outline-none focus:border-[#3ecf8e]" />
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {plan.searchingStocks ? <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-[#8c8c95]"><LoadingSpinner size={12} />Loading stocks…</div> : null}
            {plan.addResults.map((item) => (
              <button key={item.symbol} type="button" disabled={plan.addingSymbol === item.symbol} onClick={() => void plan.addStock(item.symbol)} className="flex w-full items-center gap-[9px] border-t border-[#1a1a1e] px-3 py-2.5 text-left hover:bg-[#161619] disabled:opacity-60">
                <span className="w-[54px] flex-none font-mono text-[12.5px] font-semibold">{item.symbol}</span>
                <span className="flex-none rounded-[4px] border border-[#2a2a31] px-[5px] py-px text-[9.5px] text-[#8c8c95]">{item.market}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#8c8c95]">{item.name}</span>
                <span className="flex flex-none items-center gap-2 font-mono text-[11.5px] text-[#3ecf8e]">{plan.addingSymbol === item.symbol ? <LoadingSpinner size={12} /> : null}+1 share</span>
              </button>
            ))}
            {!plan.searchingStocks && !plan.addResults.length ? <div className="p-3.5 text-center text-xs text-[#8c8c95]">Everything matching is already in the plan.</div> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-[14px] flex items-center justify-between border-t border-[#2a2a31] pt-[13px]">
        <div>
          <div className={`text-xs font-semibold ${plan.overReserve ? "text-[#f2575c]" : "text-[#3ecf8e]"}`}>{plan.overReserve ? "Over your cash to deploy" : "Committed"}</div>
          <div className="text-[11px] text-[#8c8c95]">of {formatMoneyBaht(plan.cashReserve)} cash ready</div>
        </div>
        <span className={`font-mono text-lg font-semibold ${plan.overReserve ? "text-[#f2575c]" : "text-[#ececee]"}`}>
          <Money value={plan.committed} secondaryClassName="text-[11px] font-normal text-[#5a5a62]" />
        </span>
      </div>

      <button type="button" onClick={() => void plan.applyPlan()} disabled={!plan.canApply || plan.applying} className="mt-[10px] flex w-full items-center justify-center gap-[7px] rounded-lg bg-[#3ecf8e] py-2.5 text-[13px] font-bold text-[#06120c] disabled:cursor-not-allowed disabled:bg-[#23232a] disabled:text-[#5a5a62]">
        {plan.applying ? <LoadingSpinner size={14} /> : null}
        {plan.applying ? "Buying at current prices…" : `Apply ${plan.applyLabel}`}
      </button>
      {plan.overReserve ? <p className="mt-2 text-center text-[11px] text-[#f2575c]">Committed amount exceeds your cash to invest — add funds or lower an amount.</p> : null}
      {plan.applyError ? <p className="mt-2 text-center text-[11px] text-[#f2575c]">{plan.applyError}</p> : null}

      <PremiumAiButton label="Ask AI where to place it" sublabel="Premium · plan assist" onClick={() => void plan.askAi()} size="compact" className="mt-[11px] w-full" />

      {plan.addFundsOpen ? (
        <Modal title="Add funds" onClose={plan.hideAddFunds}>
          <form onSubmit={plan.submitAddFunds} className="grid gap-3">
            <input autoFocus required type="number" min="1" step="any" className={input} placeholder="Amount in THB" value={plan.addFundsAmount} onChange={(event) => plan.setAddFundsAmount(event.target.value)} />
            <button className="mt-1 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c]">Add to cash to invest</button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function formatShares(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
