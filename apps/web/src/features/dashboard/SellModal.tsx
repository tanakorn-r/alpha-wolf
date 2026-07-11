import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Money } from "../../components/Money";
import { Modal } from "../../components/ui/Modal";
import { formatCurrency, priceToUsdBase } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function SellModal({ dash }: { dash: Dashboard }) {
  const holding = dash.sellTarget;
  if (!holding) return null;
  // holding.price is the instrument-native quote (e.g. THB for .BK); convert to
  // USD base before it feeds into <Money>, which expects USD-base aggregate money.
  const proceeds = holding.shares * priceToUsdBase(holding.price, holding.currency ?? holding.symbol);
  return (
    <Modal title={`Sell ${holding.symbol}`} onClose={dash.cancelSell}>
      <p className="text-[13px] leading-[1.6] text-[#bcbcc2]">
        This places a market order to sell <span className="text-[#ececee]">all {holding.shares} shares</span> at the current price. Cash settles in 1–2 business days.
      </p>
      <div className="mt-4 overflow-hidden rounded-[11px] border border-[#2a2a31]">
        <Row label="Shares" value={String(holding.shares)} />
        <Row label="Current price" value={formatCurrency(holding.price, holding.currency)} />
        <Row label="Realized P/L" value={<Money value={holding.gainLoss} />} color={holding.gainLoss >= 0 ? "#3ecf8e" : "#f2575c"} />
        <div className="flex items-center justify-between bg-[#121215] px-[15px] py-[14px]">
          <span className="font-semibold">Estimated proceeds</span>
          <span className="font-mono text-[17px] font-semibold text-[#3ecf8e]"><Money value={proceeds} /></span>
        </div>
      </div>
      <div className="mt-4 flex gap-2.5">
        <button type="button" disabled={dash.selling} onClick={dash.cancelSell} className="flex-1 rounded-[10px] border border-[#2a2a31] py-3 text-[13.5px] font-medium hover:border-[#8c8c95] disabled:opacity-60">
          Cancel
        </button>
        <button type="button" disabled={dash.selling} onClick={() => void dash.confirmSell()} className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#f2575c] py-3 text-[13.5px] font-bold text-[#1a0608] hover:bg-[#e04349] disabled:opacity-60">
          {dash.selling ? <LoadingSpinner size={14} /> : null}Sell all shares
        </button>
      </div>
    </Modal>
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
