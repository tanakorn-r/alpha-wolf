import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Modal } from "../../components/ui/Modal";
import type { Dashboard } from "./useDashboard";
import { localDateKey } from "../../lib/date";

const input = "h-10 rounded-lg border border-[#34343c] bg-[#0e0e10] px-3 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function HoldingFormModal({ dash }: { dash: Dashboard }) {
  const form = dash.holdingForm;
  return (
    <Modal title="Add to portfolio" onClose={form.hide}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
        className="grid gap-3"
      >
        <label className="grid gap-1 text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">
          Ticker
          <input required className={input} placeholder="e.g. KO or PTT.BK" value={form.value.symbol} onChange={(e) => form.set("symbol", e.target.value.toUpperCase())} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">
            Buy date
            <input required type="date" max={localDateKey()} className={input} value={form.value.occurredAt} onChange={(e) => form.set("occurredAt", e.target.value)} />
          </label>
          <label className="grid gap-1 text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">
            Fees
            <input type="number" min="0" step="any" className={input} value={form.value.fees} onChange={(e) => form.set("fees", e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1 text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">
          Units bought
          <input required type="number" min="0" step="any" className={input} placeholder="Number of shares" value={form.value.shares} onChange={(e) => form.set("shares", e.target.value)} />
        </label>
        <label className="grid gap-1 text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">
          Price paid (per share)
          <input required type="number" min="0" step="any" className={input} placeholder="Your buy price" value={form.value.averageCost} onChange={(e) => form.set("averageCost", e.target.value)} />
        </label>
        <p className="text-[11px] leading-[1.5] text-[#5a5a62]">Buying more of a stock you already hold averages into your existing position.</p>
        <button disabled={form.saving} className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c] disabled:opacity-60">
          {form.saving ? <LoadingSpinner size={14} /> : null}Add to portfolio
        </button>
      </form>
    </Modal>
  );
}
