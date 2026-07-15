import { Link } from "react-router-dom";

export function RiskDisclaimer() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-3 pt-1 text-center text-[9.5px] leading-[1.5] text-[#4a4a52] max-[719px]:pb-[calc(0.5rem_+_env(safe-area-inset-bottom)+56px)]">
      Not financial advice. Every score, verdict, and Agent read is AI-generated from historical and delayed market
      data — it can be wrong. Investing risks loss of principal; past performance, including backtests, does not
      guarantee future results. Make your own decisions and consult a licensed advisor before investing real money.
      <nav className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[#686870]"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/refunds">Refunds</Link><Link to="/support">Support</Link></nav>
    </div>
  );
}
