import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Modal } from "../../components/ui/Modal";
import type { Dashboard } from "./useDashboard";

const input = "h-10 rounded-lg border border-[#34343c] bg-[#0e0e10] px-3 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function HoldingFormModal({ dash }: { dash: Dashboard }) {
  const form = dash.holdingForm;
  return (
    <Modal title="Add or update holding" onClose={form.hide}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
        className="grid gap-3"
      >
        <input required className={input} placeholder="Ticker, e.g. KO" value={form.value.symbol} onChange={(e) => form.set("symbol", e.target.value.toUpperCase())} />
        <input required type="number" step="any" className={input} placeholder="Shares" value={form.value.shares} onChange={(e) => form.set("shares", e.target.value)} />
        <input required type="number" step="any" className={input} placeholder="Average cost" value={form.value.averageCost} onChange={(e) => form.set("averageCost", e.target.value)} />
        <input type="number" step="any" className={input} placeholder="Monthly capital plan" value={form.value.monthlyDca} onChange={(e) => form.set("monthlyDca", e.target.value)} />
        <button disabled={form.saving} className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c] disabled:opacity-60">
          {form.saving ? <LoadingSpinner size={14} /> : null}Save holding
        </button>
      </form>
    </Modal>
  );
}
